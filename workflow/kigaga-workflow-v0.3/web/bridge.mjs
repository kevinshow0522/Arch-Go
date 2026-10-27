import { App } from '@modelcontextprotocol/ext-apps';

const CONNECT_TIMEOUT_MS = 5000;
const READ_TOOLS=new Set(['kg_open_workbench','kg_get_connection','kg_get_project_progress','kg_get_project','kg_get_task','kg_list_tasks','kg_list_records','kg_get_record','kg_list_materials','kg_read_material','kg_read_result','kg_list_project_files','kg_read_project_file','kg_check_artifact','kg_find_projects']);
function assertReadTool(name){if(!READ_TOOLS.has(name))throw new Error('工作台只查看流程，请在对话中修改项目。');}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function assertToolResult(result) {
  if (result?.isError) {
    const text = result.content?.find?.((item) => item.type === 'text')?.text;
    throw new Error(text || '项目服务返回错误');
  }
  return result;
}

export function unwrapToolResult(result) {
  assertToolResult(result);
  return result?._meta?.workbench ?? (result?._meta?.task ? {task:result._meta.task} : null) ?? result?.structuredContent ?? result ?? {};
}

function compatibilityBridge(openai, onToolResult) {
  const initialResult = openai.toolOutput || openai.toolResponseMetadata
    ? {
        structuredContent: openai.toolOutput,
        _meta: openai.toolResponseMetadata,
      }
    : null;

  const notify = () => {
    if (openai.toolOutput || openai.toolResponseMetadata) {
      onToolResult?.(unwrapToolResult({
        structuredContent: openai.toolOutput,
        _meta: openai.toolResponseMetadata,
      }));
    }
  };
  window.addEventListener('openai:set_globals', notify);

  return {
    kind: 'compatibility',
    get canSendFollowUp() { return false; },
    initial: initialResult ? unwrapToolResult(initialResult) : null,
    async callTool(name, args) {
      assertReadTool(name);return unwrapToolResult(await openai.callTool(name, args));
    },
    async sendFollowUpMessage() { throw new Error('工作台只查看流程，请在对话中回复。'); },
    close() {
      window.removeEventListener('openai:set_globals', notify);
    },
  };
}

export async function connectWorkbenchBridge({ onToolResult } = {}) {
  const compatible = window.openai
    && typeof window.openai.callTool === 'function';
  if (window.parent === window) {
    if (compatible) return compatibilityBridge(window.openai, onToolResult);
    throw new Error('未检测到可用的工作台宿主');
  }

  const app = new App(
    { name: 'KI建筑设计工作流', version: '0.6.0' },
    { availableDisplayModes: ['inline', 'fullscreen', 'pip'] },
    { autoResize: true, strict: true },
  );
  app.ontoolresult = (result) => {
    try {
      onToolResult?.(unwrapToolResult(result));
    } catch (error) {
      onToolResult?.({ bridge_error: error instanceof Error ? error.message : '工具结果不可用' });
    }
  };
  try {
    await withTimeout(app.connect(), CONNECT_TIMEOUT_MS, '连接项目服务超时');
  } catch (error) {
    try {
      await app.close();
    } catch {
      // The fallback remains usable even if the partial standard session cannot close cleanly.
    }
    if (compatible) return compatibilityBridge(window.openai, onToolResult);
    throw error;
  }

  return {
    kind: 'standard',
    canSendFollowUp: false,
    initial: null,
    async callTool(name, args) {
      assertReadTool(name);return unwrapToolResult(await app.callServerTool({ name, arguments: args }));
    },
    async sendFollowUpMessage() { throw new Error('工作台只查看流程，请在对话中回复。'); },
    close() {
      app.close();
    },
  };
}
