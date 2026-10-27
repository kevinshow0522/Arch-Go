export const METHOD_VERSION='1.30';
export function assertMethodVersion(value){
 if(value!==undefined&&value!==METHOD_VERSION)throw new Error('方法已更新，请重新加载 skill（当前方法1.30）。');
}
