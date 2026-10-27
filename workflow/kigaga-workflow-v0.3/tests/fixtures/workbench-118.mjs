export function workbench118Fixture(){
 const pid='118-project';
 const result=(title,questions=[])=>({title,narrative:'依据当前资料形成的判断。',facts:['底稿已核读'],assumptions:[],questions,actions:['按本轮范围续接']});
 const task=(id,tags,extra={})=>({id,project_id:pid,instruction:id,output:id,status:'completed',revision:1,state_version:1,stage_ids:[],tags,materials:[],history:[],checkpoint:{done:[],checks:['本轮核读检查'],next:'继续',blockers:[]},...extra});
 return {
  schema_version:3,project:{id:pid,name:'项目目录核验',summary:'服务深度：b；进入：b\n核对交通与到达，制作本轮沟通成果。'},projects:[],materials:[],artifacts:[],
  records:[{id:'catalog-118',project_id:pid,kind:'note',title:'项目目录',status:'active',version:2,updated_at:'2026-10-15T11:00:00Z',content:[
   '## 01 进入阶段补齐','01.1｜当前资料底稿｜补齐｜M01.1','01.3｜本轮决策关系｜补齐｜M01.3','01.5｜本次服务范围｜补齐｜章末｜M01.5',
   '## 02 本轮任务条件','02.7｜本轮任务书｜补齐｜章末｜M02.7',
   '## 03 场地与交通研究','03.1｜已核读场地资料｜补齐｜M03.1','03.4｜交通到达与入口｜核心｜M03.4',
   '03.5｜北侧学校的干扰｜按需｜补充：学校接送与视线','03.6｜本轮场地结论｜核心｜章末｜M03.8',
   '## 09 沟通制作','09.1｜文本编排｜按需｜M07.1','09.2｜交互阅览｜按需｜M07.2','## 曾用编号','03.S1→03.5'
  ].join('\n')},{id:'decision-118',project_id:pid,kind:'decision',title:'确认：03.4｜任务traffic@第1版',source:'对话确认 2026-10-15',status:'confirmed',version:1,content:'已确认交通到达判断。'}],
  tasks:[
   task('external',['条目:03.1','执行:GPT','来源:外部已有'],{result:result('前期场地资料核读')}),
   task('traffic',['条目:03.4','条目:03.6','执行:GPT'],{result:result('交通到达判断',['已经回复的入口问题','仍待决定的后勤时段']),checkpoint:{done:['你已确认：第1版（决定decision-118）','已回复 Q1：采用东侧入口'],checks:['核对道路与人车到达'],next:'等待后勤时段',blockers:[]}}),
   task('school',['条目:03.S1','执行:Claude','转自:GPT'],{result:result('学校干扰判断')}),
   task('display',['条目:09.1','执行:Claude'],{stage_ids:['delivery'],status:'in_progress',result:result('文本编排草稿')}),
   task('unscoped',['执行:GPT'],{status:'prepared',revision:0,result:null})
  ]
 };
}
