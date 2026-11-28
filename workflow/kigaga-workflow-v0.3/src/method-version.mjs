export const METHOD_VERSION='1.30';
// 放行和打回规则是哪一天的。方法文字的修订日期可以比它新：那些规则这份服务还没实现。
export const SERVICE_RULES_REVISION='2026-11-20';
export function assertMethodVersion(value){
 if(value!==undefined&&value!==METHOD_VERSION)throw new Error('方法已更新，请重新加载 skill（当前方法1.30）。');
}
