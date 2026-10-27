import { STAGES } from '../src/stages.mjs';
import { connectWorkbenchBridge } from './bridge.mjs';
import { createTaskDispatcher, shouldReplaceTask } from './flow.mjs';

const root = document.getElementById('kg-workbench')?.querySelector('[data-app-root]');
const stageLabels = {
  general: '项目任务', opportunity: '项目机会', positioning: '项目定位', site: '场地策略',
  cases: '案例研究', concept: '概念方案', development: '方案深化', delivery: '成果交付',
};
const stageLabel = (stage) => stageLabels[stage.id] || stage.name;

function enterStage(stage) {
  state.section = 'stage';
  state.stageId = stage.id;
  state.selectedTaskId = null;
  state.tab = selectedTask()?.result ? '分析成果' : '资料';
  render();
}

const state = {
  mode: window.__KG_PREVIEW__ ? 'preview' : 'connecting',
  snapshot: normalizeSnapshot(window.__KG_PREVIEW__ || null),
  bridge: null,
  serviceReady: false,
  section: window.__KG_PREVIEW__?.selected_task ? 'stage' : 'overview',
  stageId: window.__KG_PREVIEW__?.selected_task?.stage_id || STAGES[0].id,
  tab: window.__KG_PREVIEW__?.selected_task?.result ? '分析成果' : '资料',
  selectedTaskId: window.__KG_PREVIEW__?.selected_task?.id || null,
  modal: null,
  error: '',
  busy: '',
  taskDrafts: {},
  projectDraft: { name: '', summary: '' },
  materialDraft: { id: null, expectedVersion: null, title: '', content: '', source: '' },
  requestKeys: new Map(),
  dispatcher: null,
};

function normalizeSnapshot(snapshot) {
  return {
    schema_version: snapshot?.schema_version || 2,
    stages: snapshot?.stages?.length ? (snapshot.stages.some(s=>s.id==='general') ? snapshot.stages : [{id:'general',name:'项目任务',output:'按当前目标形成成果',questions:[]},...snapshot.stages]) : STAGES,
    projects: Array.isArray(snapshot?.projects) ? snapshot.projects : [],
    project: snapshot?.project || null,
    materials: Array.isArray(snapshot?.materials) ? snapshot.materials : [],
    tasks: Array.isArray(snapshot?.tasks) ? snapshot.tasks : [],
    selected_task: snapshot?.selected_task || null,
  };
}

function textError(error, fallback = '操作未完成，请稍后重试') {
  return error instanceof Error && error.message ? error.message : fallback;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `kg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requestIdFor(kind, payload) {
  const signature = JSON.stringify(payload);
  const previous = state.requestKeys.get(kind);
  if (previous?.signature === signature) return previous.id;
  const id = createId();
  state.requestKeys.set(kind, { signature, id });
  return id;
}

function clearRequestId(kind) {
  state.requestKeys.delete(kind);
}

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value ?? '';
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'disabled') node.disabled = Boolean(value);
    else if (key === 'checked') node.checked = Boolean(value);
    else if (key === 'value') node.value = value ?? '';
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function actionButton(label, onClick, { kind = 'secondary', disabled = false } = {}) {
  return h('button', {
    type: 'button',
    class: `kg-button kg-button--${kind}`,
    disabled,
    onClick,
  }, h('span', { text: label }));
}

function isWritable() {
  return state.mode === 'ready' && state.serviceReady && !state.busy;
}

function selectedStage() {
  return state.snapshot.stages.find((stage) => stage.id === state.stageId) || STAGES[0];
}

function selectedTask() {
  const explicit = state.snapshot.tasks.find((task) => task.id === state.selectedTaskId);
  if (explicit && (explicit.stage_ids?.includes(state.stageId) || explicit.stage_id === state.stageId)) return explicit;
  return state.snapshot.tasks.find((task) => (task.stage_ids?.includes(state.stageId) || task.stage_id === state.stageId)) || null;
}

function tasksForStage(stageId) {
  return state.snapshot.tasks.filter((task) => (task.stage_ids?.includes(stageId) || task.stage_id === stageId));
}

function formatDate(value) {
  if (!value) return '时间未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function statusMeta(status) {
  if (state.mode === 'preview') return ['对话快照', 'violet'];
  return {
    prepared: ['已保存，待发送', 'neutral'],
    message_accepted: ['消息已被宿主接受', 'blue'],
    completed: ['已完成检查', 'green'],
    in_progress: ['进行中', 'blue'], needs_review: ['待复核', 'violet'],
    waiting_material: ['等待资料', 'neutral'], waiting_decision: ['待你决定', 'violet'],
    paused: ['已暂停', 'neutral'], cancelled: ['已取消', 'neutral'],
  }[status] || ['状态未知', 'neutral'];
}

function updateSnapshot(snapshot) {
  const next = normalizeSnapshot(snapshot);
  const selected = next.selected_task
    || next.tasks.find((task) => task.id === state.selectedTaskId)
    || null;
  state.snapshot = next;
  state.selectedTaskId = selected?.id || null;
  if (selected?.stage_id) state.stageId = selected.stage_id;
  for (const task of next.tasks) state.dispatcher?.syncTask(task);
}

function mergeTask(task) {
  const tasks = [...state.snapshot.tasks];
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) {
    if (shouldReplaceTask(tasks[index], task)) tasks[index] = task;
  } else {
    tasks.push(task);
  }
  const current = tasks.find((item) => item.id === task.id);
  state.snapshot = { ...state.snapshot, tasks, selected_task: current };
  state.selectedTaskId = current.id;
  state.stageId = current.stage_id || state.stageId;
  state.dispatcher?.syncTask(current);
}

function handleToolPayload(payload) {
  if (!payload) return;
  if (payload.bridge_error) {
    state.error = payload.bridge_error;
  } else if (payload.project !== undefined && Array.isArray(payload.projects)) {
    updateSnapshot(payload);
    state.error = '';
  } else if (payload.task?.id) {
    mergeTask(payload.task);
    state.error = '';
  }
  render();
}

async function runAction(label, action) {
  if (state.busy) return null;
  state.busy = label;
  state.error = '';
  render();
  try {
    return await action();
  } catch (error) {
    state.error = textError(error);
    return null;
  } finally {
    state.busy = '';
    render();
  }
}

async function refreshSnapshot() {
  if (!state.bridge) return;
  await runAction('refresh', async () => {
    const payload = await state.bridge.callTool('kg_open_workbench', {
      ...(state.snapshot.project?.id ? { project_id: state.snapshot.project.id } : {}),
      ...(state.selectedTaskId ? { task_id: state.selectedTaskId } : {}),
    });
    updateSnapshot(payload);
  });
}

async function selectProject(projectId) {
  if (!state.bridge || !projectId) return;
  await runAction('project', async () => {
    const payload = await state.bridge.callTool('kg_open_workbench', { project_id: projectId });
    updateSnapshot(payload);
    state.section = 'overview';
    state.selectedTaskId = payload.selected_task?.id || null;
  });
}

async function submitProject(event) {
  event.preventDefault();
  const payload = { name: state.projectDraft.name.trim(), summary: state.projectDraft.summary.trim() };
  if (!payload.name) {
    state.error = '请输入项目名称';
    render();
    return;
  }
  await runAction('create-project', async () => {
    const result = await state.bridge.callTool('kg_create_project', {
      ...payload,
      request_id: requestIdFor('project', payload),
    });
    updateSnapshot(result);
    clearRequestId('project');
    state.projectDraft = { name: '', summary: '' };
    state.modal = null;
  });
}

function openMaterial(material = null) {
  state.materialDraft = material
    ? {
        id: material.id,
        expectedVersion: material.version,
        title: material.title,
        content: material.content,
        source: material.source || '',
      }
    : { id: null, expectedVersion: null, title: '', content: '', source: '' };
  state.modal = 'material';
  state.error = '';
  render();
}

async function submitMaterial(event) {
  event.preventDefault();
  const draft = state.materialDraft;
  const payload = {
    title: draft.title.trim(), content: draft.content, source: draft.source.trim(),
  };
  if (!payload.title || !payload.content.trim()) {
    state.error = '资料标题和正文均为必填项';
    render();
    return;
  }
  await runAction('material', async () => {
    let result;
    if (draft.id) {
      result = await state.bridge.callTool('kg_update_material', {
        material_id: draft.id,
        expected_version: draft.expectedVersion,
        ...payload,
      });
    } else {
      const requestPayload = { project_id: state.snapshot.project.id, ...payload };
      result = await state.bridge.callTool('kg_add_material', {
        ...requestPayload,
        request_id: requestIdFor('material', requestPayload),
      });
      clearRequestId('material');
    }
    updateSnapshot(result);
    state.modal = null;
  });
}

function taskDraft(stage) {
  const key = `${state.snapshot.project?.id || 'none'}:${stage.id}`;
  if (!state.taskDrafts[key]) {
    state.taskDrafts[key] = {
      instruction: '',
      output: stage.output,
      materialIds: [],
    };
  }
  return state.taskDrafts[key];
}

async function dispatchTask(event) {
  event.preventDefault();
  const stage = selectedStage();
  const draft = taskDraft(stage);
  if (!draft.instruction.trim() || !draft.output.trim()) {
    state.error = '请填写任务说明和预期输出';
    render();
    return;
  }
  const result = await state.dispatcher.dispatch({
    project_id: state.snapshot.project.id,
    ...(stage.id === 'general' ? {} : {stage_id:stage.id}),
    material_ids: [...draft.materialIds],
    material_versions: draft.materialIds.map((id) => {
      const material = state.snapshot.materials.find((item) => item.id === id);
      return `${id}:${material?.version ?? 'unknown'}`;
    }),
    instruction: draft.instruction.trim(),
    output: draft.output.trim(),
  });
  if (result.task) mergeTask(result.task);
  if (result.phase === 'send_failed') state.error = `任务已保存，但消息未发送：${result.error}`;
  else if (result.phase === 'accepted_unsynced') state.error = `消息已被宿主接受，状态同步未确认：${result.error}。请刷新核对，避免重复发送。`;
  else if (result.phase === 'prepare_failed') state.error = result.error;
  render();
}

function exportResult(task) {
  if (!task?.result) return;
  const result = task.result;
  const section = (title, values) => values?.length
    ? `\n## ${title}\n\n${values.map((value) => `- ${value}`).join('\n')}\n`
    : `\n## ${title}\n\n暂无\n`;
  const markdown = [
    `# ${result.title || task.stage_name}`,
    '',
    result.narrative || '',
    section('事实', result.facts),
    section('假设', result.assumptions),
    section('待确认问题', result.questions),
    section('下一步行动', result.actions),
  ].join('\n');
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: `${result.title || task.stage_name || 'KiGAGA-成果'}.md` });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderBanner() {
  if (state.mode === 'preview') {
    return h('div', { class: 'kg-banner', role: 'status', text: '对话预览 · 只读' });
  }
  if (state.mode === 'connecting') {
    return h('div', { class: 'kg-banner', role: 'status', text: '正在连接项目服务…' });
  }
  if (state.mode === 'disconnected') {
    return h('div', { class: 'kg-banner', role: 'status', text: '项目服务未连接 · 只读' });
  }
  return null;
}

function renderHeader() {
  const select = h('select', {
    'aria-label': '选择项目',
    disabled: !isWritable(),
    onChange: (event) => selectProject(event.target.value),
  });
  select.append(h('option', { value: '', text: state.snapshot.projects.length ? '选择项目' : '暂无项目' }));
  for (const project of state.snapshot.projects) {
    select.append(h('option', {
      value: project.id,
      text: project.name,
      selected: project.id === state.snapshot.project?.id ? 'selected' : null,
    }));
  }
  return h('header', { class: 'kg-header' },
    h('button', {
      type: 'button', class: 'kg-brand', onClick: () => { state.section = 'overview'; render(); },
      'aria-label': '返回项目总览',
    }, h('span', { class: 'kg-brand__name', text: 'KiGAGA' })),
    h('div', { class: 'kg-project-switcher' },
      state.snapshot.projects.length > 1 ? select : h('span', { class: 'kg-project-name', text: state.snapshot.project?.name || '工作台' }),
      actionButton('新建项目', () => { state.modal = 'project'; state.error = ''; render(); }, {
        kind: 'ghost', disabled: !isWritable(),
      }),
      actionButton('刷新', refreshSnapshot, {
        disabled: !isWritable(), iconName: 'refresh',
      }),
    ),
  );
}

function navButton(label, active, onClick, extraClass = '') {
  return h('button', {
    type: 'button', class: `kg-nav__item ${active ? 'is-active' : ''} ${extraClass}`,
    'aria-current': active ? 'page' : null, onClick,
  }, h('span', { text: label }));
}

function renderSidebar() {
  return h('aside', { class: 'kg-sidebar', 'aria-label': '工作台导航' },
    h('nav', { class: 'kg-nav' },
      navButton('总览', state.section === 'overview', () => { state.section = 'overview'; render(); }),
      h('div', { class: 'kg-nav__label', text: '工作阶段' }),
      state.snapshot.stages.map((stage, index) => navButton(
        stageLabel(stage),
        state.section === 'stage' && state.stageId === stage.id,
        () => enterStage(stage),
        'kg-nav__stage',
      )).map((button, index) => {
        button.prepend(h('span', { class: 'kg-nav__index', text: String(index + 1).padStart(2, '0') }));
        button.setAttribute('aria-label', state.snapshot.stages[index].name);
        return button;
      }),
      h('div', { class: 'kg-nav__divider' }),
      navButton('资料库', state.section === 'materials', () => { state.section = 'materials'; render(); }),
      navButton('成果库', state.section === 'results', () => { state.section = 'results'; render(); }),
    ),
  );
}

function emptyState(title, body, action = null) {
  return h('section', { class: 'kg-empty' },
    h('h2', { text: title }),
    body ? h('p', { text: body }) : null,
    action,
  );
}

function renderOverview() {
  const project = state.snapshot.project;
  if (!project) {
    return h('main', { class: 'kg-main' }, emptyState(
      '暂无项目',
      '新建项目，开始整理资料与任务。',
      actionButton('新建项目', () => { state.modal = 'project'; render(); }, { kind: 'primary', disabled: !isWritable(), iconName: 'plus' }),
    ));
  }
  return h('main', { class: 'kg-main' },
    h('div', { class: 'kg-eyebrow', text: '总览' }),
    h('div', { class: 'kg-title-row' },
      h('div', {}, h('h1', { text: project.name })),
    ),
    project.summary ? h('details', { class: 'kg-disclosure kg-project-summary' },
      h('summary', { text: '项目摘要' }), h('p', { text: project.summary })) : null,
    h('section', {},
        h('ol', { class: 'kg-stage-list' }, state.snapshot.stages.map((stage, index) => {
          const stageTasks = tasksForStage(stage.id);
          const completed = stageTasks.some((task) => task.status === 'completed' || task.result);
          return h('li', {},
            h('button', { type: 'button', 'aria-label': stage.name, onClick: () => enterStage(stage) },
              h('span', { class: `kg-stage-list__number ${completed ? 'is-complete' : ''}`, text: String(index + 1).padStart(2, '0') }),
              h('span', { class: 'kg-stage-list__copy', text: stageLabel(stage) }),
              h('span', { class: 'kg-stage-list__status', text: completed ? (state.mode === 'preview' ? '对话快照' : '已有成果') : stageTasks.length ? '处理中' : '尚未开始' }),
              h('span', { 'aria-hidden': 'true', text: '›' }),
            ),
          );
        })),
    ),
  );
}

function renderMaterials() {
  const project = state.snapshot.project;
  return h('main', { class: 'kg-main' },
    h('div', { class: 'kg-title-row' },
      h('h1', { text: '资料库' }),
      actionButton('添加资料', () => openMaterial(), { kind: 'primary', disabled: !project || !isWritable() }),
    ),
    !project ? emptyState('请先选择项目', '')
      : state.snapshot.materials.length === 0 ? emptyState('暂无资料', '可添加文字资料。')
        : h('section', { class: 'kg-card-list' }, state.snapshot.materials.map((material) => h('article', { class: 'kg-material-card' },
          h('div', { class: 'kg-card-list__main' },
            h('div', { class: 'kg-card-kicker', text: `版本 ${material.version} · ${material.source || '手动录入'}` }),
            h('details', { class: 'kg-disclosure' }, h('summary', { text: material.title }), h('p', { text: material.content })),
          ),
          h('div', { class: 'kg-card-list__aside' },
            h('time', { text: formatDate(material.created_at) }),
            actionButton('编辑', () => openMaterial(material), { disabled: !isWritable() }),
          ),
        ))),
  );
}

function openTask(task) {
  state.section = 'stage';
  state.stageId = task.stage_id;
  state.selectedTaskId = task.id;
  state.tab = task.result ? '分析成果' : '资料';
  render();
}

function renderResultsLibrary() {
  const resultTasks = state.snapshot.tasks.filter((task) => task.result);
  return h('main', { class: 'kg-main' },
    h('div', { class: 'kg-title-row' }, h('h1', { text: '成果库' })),
    !state.snapshot.project ? emptyState('请先选择项目', '')
      : resultTasks.length === 0 ? emptyState('暂无成果', '阶段成果保存后会显示在这里。')
        : h('section', { class: 'kg-card-list' }, resultTasks.map((task) => {
          const [label, tone] = statusMeta(task.status);
          return h('article', { class: 'kg-result-card' },
            h('div', { class: 'kg-card-list__main' },
              h('div', { class: 'kg-card-kicker', text: stageLabels[task.stage_id] || task.stage_name }),
              h('h2', { text: task.result.title }),
            ),
            h('div', { class: 'kg-card-list__aside' },
              h('span', { class: `kg-pill kg-pill--${tone}`, text: label }),
              actionButton('查看', () => openTask(task)),
            ),
          );
        })),
  );
}

function renderTaskForm(stage) {
  const draft = taskDraft(stage);
  const form = h('form', { class: 'kg-task-form', onSubmit: dispatchTask },
    h('div', { class: 'kg-form-section' },
      h('h3', { text: '参考资料' }),
      state.snapshot.materials.length
        ? h('div', { class: 'kg-check-list' }, state.snapshot.materials.map((material) => h('label', { class: 'kg-check' },
          h('input', {
            type: 'checkbox', value: material.id, checked: draft.materialIds.includes(material.id),
            onChange: (event) => {
              draft.materialIds = event.target.checked
                ? [...draft.materialIds, material.id]
                : draft.materialIds.filter((id) => id !== material.id);
            },
          }),
          h('span', {}, h('strong', { text: material.title }), h('small', { text: `版本 ${material.version} · ${material.source || '手动录入'}` })),
        )))
        : h('p', { class: 'kg-inline-empty', text: '暂无资料，可直接填写任务。' }),
    ),
    h('div', { class: 'kg-form-section' },
      h('label', { class: 'kg-field' }, h('span', { text: '任务说明' }), h('textarea', {
        name: 'instruction', rows: '4', value: draft.instruction, placeholder: '这一步需要解决什么？',
        onInput: (event) => { draft.instruction = event.target.value; },
      })),
      h('details', { class: 'kg-disclosure kg-output-settings' }, h('summary', { text: '输出设置' }),
        h('label', { class: 'kg-field' }, h('span', { text: '预期输出' }), h('textarea', {
        name: 'output', rows: '3', value: draft.output,
        onInput: (event) => { draft.output = event.target.value; },
      }))),
    ),
    h('div', { class: 'kg-form-actions' },
      actionButton(state.busy === 'dispatch' ? '处理中…' : '发送任务', () => form.requestSubmit(), {
        kind: 'primary', disabled: !isWritable(),
      }),
    ),
  );
  return form;
}

function renderTaskSummary(task) {
  if (!task) return null;
  const [label, tone] = statusMeta(task.status);
  return h('details', { class: 'kg-task-summary kg-disclosure' },
    h('summary', {}, h('span', { text: '任务详情' }), h('span', { class: `kg-pill kg-pill--${tone}`, text: label })),
    h('dl', {},
      h('div', {}, h('dt', { text: '任务编号' }), h('dd', { text: task.id })),
      h('div', {}, h('dt', { text: '任务说明' }), h('dd', { text: task.instruction })),
      h('div', {}, h('dt', { text: '预期输出' }), h('dd', { text: task.output })),
      h('div', {}, h('dt', { text: '资料快照' }), h('dd', { text: task.materials?.length ? task.materials.map((item) => `${item.title} v${item.version}`).join('、') : '未选择资料' })),
      task.checkpoint ? h('div', {}, h('dt', {text:'下一步'}), h('dd', {text:task.checkpoint.next || '暂无'})) : null,
      h('div', {}, h('dt', { text: '成果版本' }), h('dd', { text: state.mode === 'preview' ? '预览稿' : `修订 ${task.revision}` })),
    ),
  );
}

function resultGroup(title, items, tone) {
  return h('details', { class: `kg-result-group kg-disclosure kg-result-group--${tone}` },
    h('summary', {}, h('span', { text: title }), h('span', { class: 'kg-detail-count', text: String(items?.length || 0) })),
    items?.length ? h('ul', {}, items.map((item) => h('li', { text: item }))) : h('p', { class: 'kg-muted', text: '暂无内容' }),
  );
}

function renderAnalysis(task) {
  if (!task?.result) return emptyState('暂无成果', '任务完成并保存后，可刷新查看。');
  const result = task.result;
  return h('div', { class: 'kg-result' },
    h('div', { class: 'kg-result__head' },
      h('div', {}, h('div', { class: 'kg-card-kicker', text: state.mode === 'preview' ? '预览稿 · 未保存' : `修订 ${task.revision}` }), h('h2', { text: result.title })),
      actionButton('导出', () => exportResult(task)),
    ),
    result.narrative?.length > 90
      ? h('details', { class: 'kg-narrative kg-disclosure' },
          h('summary', { text: `${result.narrative.slice(0, 65)}…` }), h('p', { text: result.narrative }))
      : h('p', { class: 'kg-narrative', text: result.narrative || '暂无内容' }),
    h('div', { class: 'kg-result-grid' },
      resultGroup('已知事实', result.facts, 'fact'),
      resultGroup('分析假设', result.assumptions, 'assumption'),
      resultGroup('待确认', result.questions, 'question'),
      resultGroup('行动建议', result.actions, 'action'),
    ),
  );
}

function renderQuestions(stage, task) {
  const questions = task?.result?.questions?.length ? task.result.questions : stage.questions;
  return h('div', { class: 'kg-confirmations' },
    !task?.result?.questions?.length ? h('p', { class: 'kg-muted', text: '阶段参考问题' }) : null,
    h('ol', {}, questions.map((question, index) => h('li', {}, h('span', { text: String(index + 1).padStart(2, '0') }), h('p', { text: question })))),
  );
}

function resultSnapshot(result) {
  if (!result) return h('p', { class: 'kg-muted', text: '该版本没有成果内容。' });
  return h('div', { class: 'kg-version-content' },
    h('h4', { text: result.title }),
    h('p', { text: result.narrative }),
    h('dl', {},
      h('div', {}, h('dt', { text: '事实' }), h('dd', { text: result.facts?.join('；') || '暂无' })),
      h('div', {}, h('dt', { text: '假设' }), h('dd', { text: result.assumptions?.join('；') || '暂无' })),
      h('div', {}, h('dt', { text: '待确认' }), h('dd', { text: result.questions?.join('；') || '暂无' })),
      h('div', {}, h('dt', { text: '行动' }), h('dd', { text: result.actions?.join('；') || '暂无' })),
    ),
  );
}

function renderVersions(task) {
  if (state.mode === 'preview') return emptyState('暂无保存版本', '当前内容为对话预览。');
  if (!task?.result) return emptyState('暂无成果版本', '成果保存后可查看修订记录。');
  const history = Array.isArray(task.history) ? task.history : [];
  const previous = [...history].sort((a, b) => b.revision - a.revision).find((item) => item.revision < task.revision);
  return h('div', { class: 'kg-versions' },
    h('div', { class: 'kg-version-grid' },
      h('article', { class: 'kg-version-card' }, h('div', { class: 'kg-version-card__head' }, h('strong', { text: state.mode === 'preview' ? '当前 · 预览稿' : `当前 · 修订 ${task.revision}` }), h('span', { text: formatDate(task.created_at) })), resultSnapshot(task.result)),
      previous ? h('article', { class: 'kg-version-card' }, h('div', { class: 'kg-version-card__head' }, h('strong', { text: `上一版 · 修订 ${previous.revision}` }), h('span', { text: formatDate(previous.saved_at) })), resultSnapshot(previous.result)) : null,
    ),
    history.length > 1 ? h('div', { class: 'kg-history-list' }, h('h3', { text: '全部历史修订' }), history.map((item) => h('div', {}, h('strong', { text: `修订 ${item.revision}` }), h('span', { text: formatDate(item.saved_at) }), h('span', { text: item.result?.title || '未命名成果' })))) : null,
  );
}

function renderStage() {
  const stage = selectedStage();
  const task = selectedTask();
  const tabs = ['资料', '分析成果', '待确认', '版本'];
  let content;
  if (state.tab === '资料') content = h('div', {}, renderTaskSummary(task), renderTaskForm(stage));
  else if (state.tab === '分析成果') content = renderAnalysis(task);
  else if (state.tab === '待确认') content = renderQuestions(stage, task);
  else content = renderVersions(task);
  return h('main', { class: 'kg-main' },
    h('div', { class: 'kg-title-row kg-title-row--stage' },
      h('h1', { text: stageLabel(stage) }),
      task && tasksForStage(stage.id).length > 1 ? h('label', { class: 'kg-task-picker' }, h('span', { text: '任务' }), (() => {
        const select = h('select', { onChange: (event) => { state.selectedTaskId = event.target.value; render(); } });
        for (const item of tasksForStage(stage.id)) select.append(h('option', {
          value: item.id,
          selected: item.id === task.id ? 'selected' : null,
          text: state.mode === 'preview' ? '对话快照 · 预览稿' : `${formatDate(item.created_at)} · 修订 ${item.revision}`,
        }));
        select.value = task.id;
        return select;
      })()) : null,
    ),
    h('details', { class: 'kg-stage-info kg-disclosure' }, h('summary', { text: '阶段说明' }),
      h('p', { text: stage.name }), h('p', { text: `输出：${stage.output}` })),
    h('div', { class: 'kg-tabs', role: 'tablist', 'aria-label': '阶段详情' }, tabs.map((tab) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': state.tab === tab ? 'true' : 'false', class: state.tab === tab ? 'is-active' : '',
      id: `kg-tab-${tabs.indexOf(tab)}`, 'aria-controls': 'kg-stage-panel',
      onClick: () => { state.tab = tab; render(); }, text: tab === '分析成果' ? '成果' : tab,
    }))),
    h('section', { id: 'kg-stage-panel', class: 'kg-tab-panel', role: 'tabpanel', 'aria-labelledby': `kg-tab-${tabs.indexOf(state.tab)}` }, content),
  );
}

function renderError() {
  if (!state.error) return null;
  return h('div', { class: 'kg-error', role: 'alert' }, h('strong', { text: '操作提示' }), h('span', { text: state.error }), h('button', { type: 'button', 'aria-label': '关闭提示', onClick: () => { state.error = ''; render(); }, text: '×' }));
}

function inputField(label, input) {
  return h('label', { class: 'kg-field' }, h('span', { text: label }), input);
}

function renderModal() {
  if (!state.modal) return null;
  const close = () => { if (!state.busy) { state.modal = null; state.error = ''; render(); } };
  if (state.modal === 'project') {
    const pending = state.busy === 'create-project';
    const form = h('form', { class: 'kg-modal__body', onSubmit: submitProject },
      inputField('项目名称', h('input', { required: true, disabled: pending, value: state.projectDraft.name, placeholder: '输入真实项目名称', onInput: (event) => { state.projectDraft.name = event.target.value; } })),
      inputField('项目摘要（选填）', h('textarea', { rows: '4', disabled: pending, value: state.projectDraft.summary, placeholder: '简要说明项目背景与当前目标', onInput: (event) => { state.projectDraft.summary = event.target.value; } })),
      h('div', { class: 'kg-modal__actions' }, actionButton('取消', close), actionButton('创建项目', () => form.requestSubmit(), { kind: 'primary', disabled: !isWritable() })),
    );
    return modalShell('新建项目', '', form, close);
  }
  const draft = state.materialDraft;
  const pending = state.busy === 'material';
  const form = h('form', { class: 'kg-modal__body', onSubmit: submitMaterial },
    inputField('资料标题', h('input', { required: true, disabled: pending, value: draft.title, placeholder: '例如：项目背景与已知条件', onInput: (event) => { draft.title = event.target.value; } })),
    inputField('来源（选填）', h('input', { disabled: pending, value: draft.source, placeholder: '例如：业主访谈、规划文件', onInput: (event) => { draft.source = event.target.value; } })),
    inputField('资料正文', h('textarea', { required: true, disabled: pending, rows: '12', value: draft.content, placeholder: '粘贴或录入文字资料', onInput: (event) => { draft.content = event.target.value; } })),
    draft.id ? h('p', { class: 'kg-form-hint', text: `保存后创建版本 ${draft.expectedVersion + 1}，原版本仍保留。` }) : null,
    h('div', { class: 'kg-modal__actions' }, actionButton('取消', close), actionButton(draft.id ? '保存新版本' : '保存资料', () => form.requestSubmit(), { kind: 'primary', disabled: !isWritable() })),
  );
  return modalShell(draft.id ? '编辑资料' : '添加资料', '', form, close);
}

function modalShell(title, description, content, close) {
  return h('div', { class: 'kg-modal-backdrop' }, h('section', { class: 'kg-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'kg-modal-title' },
    h('header', { class: 'kg-modal__head' }, h('div', {}, h('h2', { id: 'kg-modal-title', text: title }), description ? h('p', { text: description }) : null), h('button', { type: 'button', disabled: Boolean(state.busy), 'aria-label': '关闭', onClick: close, text: '×' })),
    content,
  ));
}

function render() {
  if (!root) return;
  let main;
  if (state.section === 'materials') main = renderMaterials();
  else if (state.section === 'results') main = renderResultsLibrary();
  else if (state.section === 'stage') main = renderStage();
  else main = renderOverview();
  root.replaceChildren(...[
    h('div', { class: 'kg-chrome' }, renderHeader(), renderBanner()),
    h('div', { class: 'kg-layout' }, renderSidebar(), main),
    renderError(),
    renderModal(),
  ].filter(Boolean));
}

async function bootstrap() {
  render();
  if (state.mode === 'preview') return;
  try {
    state.bridge = await connectWorkbenchBridge({ onToolResult: handleToolPayload });
    if (state.bridge.initial?.project !== undefined) updateSnapshot(state.bridge.initial);
    const payload = await state.bridge.callTool('kg_open_workbench', {
      ...(state.snapshot.project?.id ? { project_id: state.snapshot.project.id } : {}),
      ...(state.snapshot.selected_task?.id ? { task_id: state.snapshot.selected_task.id } : {}),
    });
    updateSnapshot(payload);
    state.mode = 'ready';
    state.serviceReady = true;
    state.dispatcher = createTaskDispatcher({
      createRequestId: createId,
      callTool: (name, args) => state.bridge.callTool(name, args),
      sendFollowUpMessage: (message) => state.bridge.sendFollowUpMessage(message),
      onStateChange: (next) => {
        state.busy = ['preparing', 'prepared', 'host_accepted'].includes(next.phase) ? 'dispatch' : '';
        render();
      },
    });
  } catch (error) {
    state.mode = 'disconnected';
    state.serviceReady = false;
    state.error = textError(error, '无法连接项目服务');
  }
  render();
}

bootstrap();
