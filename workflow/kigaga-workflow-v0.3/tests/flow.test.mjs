import assert from 'node:assert/strict';
import test from 'node:test';

import { createTaskDispatcher, shouldReplaceTask } from '../web/flow.mjs';

const draft = {
  project_id: 'project-1',
  stage_id: 'opportunity',
  material_ids: ['material-1'],
  instruction: '只分析项目价值与关键风险',
  output: '形成结构化判断',
};

function task(overrides = {}) {
  return {
    id: 'task-1',
    request_id: 'request-1',
    status: 'prepared',
    revision: 0,
    ...overrides,
  };
}

test('dispatch prepares once, sends the task id, and confirms host acceptance', async () => {
  const calls = [];
  const dispatcher = createTaskDispatcher({
    createRequestId: () => 'request-1',
    callTool: async (name, args) => {
      calls.push([name, args]);
      if (name === 'kg_prepare_task') return { task: task() };
      return { task: task({ status: 'message_accepted' }) };
    },
    sendFollowUpMessage: async (message) => {
      calls.push(['send', message]);
      return undefined;
    },
  });

  const result = await dispatcher.dispatch(draft);

  assert.equal(result.phase, 'message_accepted');
  assert.equal(result.task.status, 'message_accepted');
  assert.deepEqual(calls[0], [
    'kg_prepare_task',
    { ...draft, request_id: 'request-1' },
  ]);
  assert.match(calls[1][1], /task-1/);
  assert.match(calls[1][1], /kg_get_task/);
  assert.match(calls[1][1], /kg_save_result/);
  assert.deepEqual(calls[2], ['kg_mark_message_accepted', { task_id: 'task-1' }]);
});

test('an unchanged retry reuses its prepared task and request id after send rejection', async () => {
  let sends = 0;
  const prepares = [];
  const dispatcher = createTaskDispatcher({
    createRequestId: () => 'stable-request',
    callTool: async (name, args) => {
      if (name === 'kg_prepare_task') {
        prepares.push(args);
        return { task: task({ request_id: args.request_id }) };
      }
      return { task: task({ status: 'message_accepted' }) };
    },
    sendFollowUpMessage: async () => {
      sends += 1;
      if (sends === 1) return { isError: true };
      return undefined;
    },
  });

  const rejected = await dispatcher.dispatch(draft);
  const retried = await dispatcher.dispatch({ ...draft });

  assert.equal(rejected.phase, 'send_failed');
  assert.equal(retried.phase, 'message_accepted');
  assert.equal(prepares.length, 1);
  assert.equal(prepares[0].request_id, 'stable-request');
  assert.equal(sends, 2);
});

test('mark failure after host acceptance is sync pending and never resends automatically', async () => {
  let sends = 0;
  const dispatcher = createTaskDispatcher({
    createRequestId: () => 'request-1',
    callTool: async (name) => {
      if (name === 'kg_prepare_task') return { task: task() };
      throw new Error('同步暂时不可用');
    },
    sendFollowUpMessage: async () => {
      sends += 1;
      return undefined;
    },
  });

  const result = await dispatcher.dispatch(draft);

  assert.equal(result.phase, 'accepted_unsynced');
  assert.match(result.error, /同步暂时不可用/);
  assert.equal(sends, 1);
  assert.equal(dispatcher.getState().phase, 'accepted_unsynced');
});

test('concurrent clicks share one dispatch promise', async () => {
  let resolveSend;
  let prepares = 0;
  let sends = 0;
  const dispatcher = createTaskDispatcher({
    createRequestId: () => 'request-1',
    callTool: async (name) => {
      if (name === 'kg_prepare_task') {
        prepares += 1;
        return { task: task() };
      }
      return { task: task({ status: 'message_accepted' }) };
    },
    sendFollowUpMessage: () => {
      sends += 1;
      return new Promise((resolve) => {
        resolveSend = resolve;
      });
    },
  });

  const first = dispatcher.dispatch(draft);
  const second = dispatcher.dispatch(draft);
  await new Promise((resolve) => setImmediate(resolve));
  resolveSend(undefined);
  await Promise.all([first, second]);

  assert.equal(prepares, 1);
  assert.equal(sends, 1);
});

test('changing task input creates a new request and prepares a new task', async () => {
  let requestSequence = 0;
  const preparedRequests = [];
  const dispatcher = createTaskDispatcher({
    createRequestId: () => `request-${++requestSequence}`,
    callTool: async (name, args) => {
      if (name === 'kg_prepare_task') {
        preparedRequests.push(args.request_id);
        return { task: task({ id: `task-${requestSequence}`, request_id: args.request_id }) };
      }
      return { task: task({ status: 'message_accepted' }) };
    },
    sendFollowUpMessage: async () => ({ isError: true }),
  });

  await dispatcher.dispatch(draft);
  await dispatcher.dispatch({ ...draft, instruction: '改为梳理核心事实' });

  assert.deepEqual(preparedRequests, ['request-1', 'request-2']);
});

test('retry preserves the request id when the prepare response was lost', async () => {
  const requestIds = [];
  let attempt = 0;
  let requestSequence = 0;
  const dispatcher = createTaskDispatcher({
    createRequestId: () => `request-${++requestSequence}`,
    callTool: async (name, args) => {
      if (name === 'kg_prepare_task') {
        requestIds.push(args.request_id);
        attempt += 1;
        if (attempt === 1) throw new Error('连接在提交后中断');
        return { task: task({ request_id: args.request_id }) };
      }
      return { task: task({ status: 'message_accepted' }) };
    },
    sendFollowUpMessage: async () => ({ isError: true }),
  });

  assert.equal((await dispatcher.dispatch(draft)).phase, 'prepare_failed');
  assert.equal((await dispatcher.dispatch({ ...draft })).phase, 'send_failed');
  assert.deepEqual(requestIds, ['request-1', 'request-1']);
});

test('a task already accepted by the host cannot be sent again', async () => {
  let sends = 0;
  const dispatcher = createTaskDispatcher({
    createRequestId: () => 'request-1',
    callTool: async (name) => {
      if (name === 'kg_prepare_task') return { task: task() };
      throw new Error('确认写入超时');
    },
    sendFollowUpMessage: async () => {
      sends += 1;
      return undefined;
    },
  });

  const first = await dispatcher.dispatch(draft);
  const second = await dispatcher.dispatch({ ...draft });

  assert.equal(first.phase, 'accepted_unsynced');
  assert.equal(second.phase, 'accepted_unsynced');
  assert.equal(sends, 1);
});

test('an authoritative completed task replaces the cached prepared task without resending', async () => {
  let sends = 0;
  const dispatcher = createTaskDispatcher({
    createRequestId: () => 'request-1',
    callTool: async (name) => {
      if (name === 'kg_prepare_task') return { task: task() };
      return { task: task({ status: 'message_accepted' }) };
    },
    sendFollowUpMessage: async () => {
      sends += 1;
      return undefined;
    },
  });

  await dispatcher.dispatch(draft);
  const completed = task({
    status: 'completed',
    revision: 1,
    result: { title: '权威成果' },
  });
  dispatcher.syncTask(completed);
  const repeated = await dispatcher.dispatch({ ...draft });

  assert.equal(repeated.phase, 'completed');
  assert.equal(repeated.task.revision, 1);
  assert.equal(repeated.task.result.title, '权威成果');
  assert.equal(sends, 1);
});

test('a selected material version change prepares a new task without extending the tool schema', async () => {
  let requestSequence = 0;
  const prepares = [];
  const dispatcher = createTaskDispatcher({
    createRequestId: () => `request-${++requestSequence}`,
    callTool: async (name, args) => {
      if (name === 'kg_prepare_task') {
        prepares.push(args);
        return { task: task({ id: `task-${requestSequence}`, request_id: args.request_id }) };
      }
      return { task: task({ id: `task-${requestSequence}`, status: 'message_accepted' }) };
    },
    sendFollowUpMessage: async () => undefined,
  });

  await dispatcher.dispatch({ ...draft, material_versions: ['material-1:1'] });
  await dispatcher.dispatch({ ...draft, material_versions: ['material-1:2'] });

  assert.equal(prepares.length, 2);
  assert.deepEqual(prepares.map((item) => item.request_id), ['request-1', 'request-2']);
  assert.equal('material_versions' in prepares[0], false);
  assert.equal('material_versions' in prepares[1], false);
});

test('a prepared task cannot replace an authoritative result at the same or newer revision', () => {
  const completed = task({ status: 'completed', revision: 1, result: { title: '成果' } });

  assert.equal(shouldReplaceTask(completed, task()), false);
  assert.equal(shouldReplaceTask(completed, task({ revision: 1 })), false);
  assert.equal(shouldReplaceTask(task(), completed), true);
});

test('new checkpoint state replaces an older completed UI snapshot at the same result revision',()=>{
 assert.equal(shouldReplaceTask({revision:1,state_version:4,status:'completed',result:{title:'结果'}},{revision:1,state_version:5,status:'needs_review',result:{title:'结果'}}),true);
 assert.equal(shouldReplaceTask({revision:1,state_version:5,status:'needs_review',result:{title:'结果'}},{revision:1,state_version:4,status:'completed',result:{title:'结果'}}),false);
});
