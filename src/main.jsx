import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

/* 数据模型：每个展项两条互不串台的轨道
 *   draft     后台正在编辑的草稿，任何修改只落在草稿上
 *   published 最近一次发布生成的快照（null = 从未发布或已撤回），访客端只读它
 */
const STORE_KEY='guide-exhibits-v2';
const COLORS=['#e6b45d','#ef8f84','#83b9b1','#9ba7dc'];
const TYPES=['装置','档案','互动','绘画'];
const SNAP_FIELDS=['title','room','type','desc','audio'];

const seed=[
  {id:1,color:'#e6b45d',
   draft:{title:'潮汐之后',room:'A01 · 主展厅',type:'装置',desc:'一件记录海岸线变化的沉浸式影像装置。',audio:'https://example.com/audio.mp3'},
   published:{title:'潮汐之后',room:'A01 · 主展厅',type:'装置',desc:'一件记录海岸线变化的沉浸式影像装置。',audio:'https://example.com/audio.mp3',publishedAt:'2024-03-02T10:00:00.000Z'}},
  {id:2,color:'#ef8f84',
   draft:{title:'未寄出的信',room:'B02 · 纸上时间',type:'档案',desc:'来自三代人的手写信件与声音档案。',audio:''},
   published:null},
  {id:3,color:'#83b9b1',
   draft:{title:'柔软的边界',room:'C01 · 新媒介',type:'互动',desc:'观众的移动会改变墙面上的光影。',audio:''},
   published:{title:'柔软的边界',room:'C01 · 新媒介',type:'互动',desc:'观众的移动会改变墙面上的光影。',audio:'',publishedAt:'2024-03-11T14:30:00.000Z'}}
];

const load=()=>{
  try{
    const raw=localStorage.getItem(STORE_KEY);
    if(raw){const data=JSON.parse(raw);if(Array.isArray(data)&&data.every(x=>x&&x.draft))return data;}
  }catch{}
  return seed;
};
const pad=n=>String(n).padStart(2,'0');
const fmtTime=iso=>{const d=new Date(iso);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;};
const takeSnapshot=draft=>({...draft,publishedAt:new Date().toISOString()});
const isLive=x=>!!x.published;
const hasChanges=x=>!!x.published&&SNAP_FIELDS.some(k=>x.draft[k]!==x.published[k]);
const canPublish=x=>!!x&&x.draft.title.trim()!==''&&x.draft.room.trim()!=='';

function App(){
  const [exhibits,setExhibits]=useState(load);
  const [selected,setSelected]=useState(1);
  const [view,setView]=useState('edit');
  const [filter,setFilter]=useState('全部');
  const [form,setForm]=useState({title:'',room:'',desc:''});
  const [notice,setNotice]=useState('');

  useEffect(()=>localStorage.setItem(STORE_KEY,JSON.stringify(exhibits)),[exhibits]);

  const visible=useMemo(
    ()=>filter==='全部'?exhibits:exhibits.filter(x=>filter==='已发布'?isLive(x):!isLive(x)),
    [exhibits,filter]
  );
  const current=exhibits.find(x=>x.id===selected)||exhibits[0];
  const liveList=useMemo(()=>exhibits.filter(isLive),[exhibits]);

  /* 新展项：先建草稿，没有 published 快照之前访客端绝不可见 */
  const add=()=>{
    if(!form.title.trim()){setNotice('请先填写展项标题');return;}
    const item={id:Date.now(),color:COLORS[exhibits.length%COLORS.length],
      draft:{title:form.title.trim(),room:form.room.trim(),type:'装置',desc:form.desc,audio:''},
      published:null};
    const next=[...exhibits,item];
    setExhibits(next);
    setSelected(item.id);
    setForm({title:'',room:'',desc:''});
    setNotice('已保存为草稿，发布前不会出现在访客端');
  };

  /* 编辑只写草稿，published 快照原封不动 */
  const patchDraft=(k,v)=>setExhibits(list=>list.map(x=>
    x.id===current.id?{...x,draft:{...x.draft,[k]:v}}:x
  ));

  /* 发布：校验草稿 -> 用最新草稿整体覆盖生成新快照 */
  const publish=()=>{
    if(!current)return;
    if(!canPublish(current)){setNotice('无法发布：草稿必须填写展项标题和所在展厅');return;}
    setExhibits(list=>list.map(x=>x.id===current.id?{...x,published:takeSnapshot(x.draft)}:x));
    setNotice(current.published?'已按最新草稿生成新快照，访客预览已更新':'展项已发布，访客端现在可以看到');
  };

  /* 撤回：只删快照，草稿原样保留；访客端立即下线 */
  const unpublish=()=>{
    setExhibits(list=>list.map(x=>x.id===current.id?{...x,published:null}:x));
    setNotice('已撤回发布，访客端不再展示；后台草稿已保留');
  };

  const exportData=()=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(exhibits,null,2)],{type:'application/json'}));
    a.download='exhibition-guide.json';a.click();
    setNotice('已导出展项数据');
  };

  /* ---------------- 访客端：只读 published 快照 ---------------- */
  if(view==='visitor')
    return <div className="visitor">
      <header>
        <div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div>
        <button className="ghost" onClick={()=>setView('edit')}>返回编辑</button>
      </header>
      <main className="visitor-main">
        <span className="eyebrow">VISITOR GUIDE / 2024</span>
        <h1>沿着作品，<em>走进</em>另一种时间。</h1>
        <p className="lead">当你靠近一件作品，它的故事就开始流动。选择一个展项开始探索。</p>
        <div className="visitor-grid">{liveList.map(x=>{const s=x.published;return (
          <article className="visitor-card" key={x.id} onClick={()=>{setSelected(x.id);setView('detail')}}>
            <div className="art" style={{background:x.color}}><span>{pad(x.id).slice(-2)}</span><i>↗</i></div>
            <div className="card-meta"><small>{s.room}</small><h3>{s.title}</h3><p>{s.desc}</p></div>
          </article>);})}
        </div>
      </main>
    </div>;

  if(view==='detail'){
    /* 详情同样只读快照；快照不存在（未发布/已撤回）时退回列表，绝不回退到草稿 */
    if(!current||!current.published){return <VisitorRedirect setView={setView}/>;}
    const s=current.published;
    return <div className="visitor">
      <header>
        <div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div>
        <button className="ghost" onClick={()=>setView('visitor')}>← 全部展项</button>
      </header>
      <main className="detail">
        <div className="detail-art" style={{background:current.color}}><span>{pad(current.id).slice(-2)}</span></div>
        <div className="detail-copy">
          <span className="eyebrow">{s.room} / {s.type}</span>
          <h1>{s.title}</h1>
          <p>{s.desc}</p>
          {s.audio&&<button className="audio" onClick={()=>setNotice('正在播放导览音频…')}>▶ 播放语音导览</button>}
          <div className="qr"><div className="qr-box">▦</div><div><strong>分享这个展项</strong><small>扫描二维码，在手机上继续阅读</small></div></div>
        </div>
      </main>
      {notice&&<div className="toast">{notice}</div>}
    </div>;
  }

  /* ---------------- 后台工作台 ---------------- */
  const dirty=!!current&&hasChanges(current);
  const publishLabel=!current?'发布':!current.published?'发布展项':dirty?'发布更新':'重新发布';

  return <div className="app">
    <aside>
      <div className="brand"><span className="mark">M</span><span>展览工作台</span></div>
      <div className="side-label">当前项目</div>
      <div className="project"><span className="project-dot"></span><div><strong>潮汐之后</strong><small>2024 春季展</small></div><span>⌄</span></div>
      <nav>
        <button className="active">▧ <span>展项内容</span><b>{exhibits.length}</b></button>
        <button>⌁ <span>展厅动线</span></button>
        <button>◉ <span>二维码</span></button>
      </nav>
      <div className="side-foot"><button>⚙ 设置</button><small>已自动保存 · 刚刚</small></div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <div><span className="eyebrow">EXHIBITION BUILDER</span><h1>展项内容</h1></div>
        <div className="top-actions">
          <button className="secondary" onClick={exportData}>↓ 导出 JSON</button>
          <button className="secondary" onClick={()=>setView('visitor')}>◉ 访客预览</button>
          {current?.published&&<button className="secondary danger" onClick={unpublish}>撤回发布</button>}
          <button className="primary" disabled={!canPublish(current)} onClick={publish} title={canPublish(current)?'':'需先填写标题与展厅'}>
            {publishLabel} <span>↗</span>
          </button>
        </div>
      </header>

      <div className="content">
        <section className="list-pane">
          <div className="list-head">
            <div><h2>全部展项</h2><span>{exhibits.length} 个展项</span></div>
            <button className="add-btn" onClick={()=>document.querySelector('.new-form').scrollIntoView({behavior:'smooth'})}>＋ 添加展项</button>
          </div>
          <div className="filters">{['全部','已发布','草稿'].map(x=>(
            <button className={filter===x?'selected':''} key={x} onClick={()=>setFilter(x)}>{x}</button>
          ))}</div>
          <div className="exhibit-list">{visible.map(x=>(
            <button className={'exhibit-row '+(selected===x.id?'chosen':'')} key={x.id} onClick={()=>setSelected(x.id)}>
              <span className="thumb" style={{background:x.color}}>{pad(x.id).slice(-2)}</span>
              <span className="row-copy">
                <strong>{x.draft.title||'未命名展项'}</strong>
                <small>{x.draft.room?x.draft.room+' · ':''}{x.draft.type}</small>
                {hasChanges(x)&&<small className="pending">● 草稿有未发布更新</small>}
              </span>
              <span className={'status '+(isLive(x)?'live':'draft')}>{isLive(x)?'已发布':'草稿'}</span>
              <span className="chev">›</span>
            </button>
          ))}</div>
        </section>

        <section className="form-panel">
          <div className="panel-title">
            <div><span className="eyebrow">EDIT DRAFT</span><h2>编辑草稿</h2></div>
            <span className={'status '+(current?.published?'live':'draft')}>{current?.published?'已发布':'草稿'}</span>
          </div>

          {current&&<>
            <div className={'snapshot-note'+(current.published?dirty?' dirty':'':' off')}>
              {current.published
                ?<>{dirty?'草稿有未发布的修改，访客仍在查看旧快照':'草稿与线上版本一致'}，线上快照发布于 {fmtTime(current.published.publishedAt)}</>
                :<>尚未发布，访客端暂不可见；填写标题与展厅后即可发布。</>}
            </div>
            <div className="editor">
              <label>展项标题<input data-field="title" value={current.draft.title} onChange={e=>patchDraft('title',e.target.value)}/></label>
              <div className="two">
                <label>所在展厅<input data-field="room" value={current.draft.room} placeholder="例如 A01 · 主展厅" onChange={e=>patchDraft('room',e.target.value)}/></label>
                <label>内容类型<select value={current.draft.type} onChange={e=>patchDraft('type',e.target.value)}>
                  {TYPES.map(t=><option key={t}>{t}</option>)}
                </select></label>
              </div>
              <label>展项介绍<textarea data-field="desc" rows="5" value={current.draft.desc} onChange={e=>patchDraft('desc',e.target.value)}/></label>
              <label>语音导览 URL<input data-field="audio" value={current.draft.audio} placeholder="https://…" onChange={e=>patchDraft('audio',e.target.value)}/>
                <small className="hint">访客扫描二维码后可播放；仅在发布后同步给访客</small>
              </label>
              <div className="preview-block">
                <div className="preview-heading"><span>二维码预览</span><button onClick={()=>setNotice('二维码链接已复制')}>复制链接</button></div>
                <div className="qr-preview">
                  <div className="qr-box big">▦</div>
                  <div><strong>展项-{pad(current.id).padStart(3,'0')}</strong><small>/guide/{current.id}</small></div>
                </div>
              </div>
            </div>
          </>}

          <div className="new-form">
            <div className="panel-title"><div><span className="eyebrow">NEW ENTRY</span><h2>快速添加展项</h2></div></div>
            <div className="two">
              <input placeholder="展项标题（必填）" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
              <input placeholder="展厅编号（发布前必填）" value={form.room} onChange={e=>setForm({...form,room:e.target.value})}/>
            </div>
            <textarea placeholder="一句话介绍…" rows="2" value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}/>
            <button className="primary full" onClick={add}>保存新展项为草稿</button>
          </div>
        </section>
      </div>
    </main>
    {notice&&<div className="toast">{notice}</div>}
  </div>;
}

/* 详情链接命中未发布/已撤回展项时，回到访客列表而不是泄露草稿内容 */
function VisitorRedirect({setView}){
  useEffect(()=>setView('visitor'),[setView]);
  return null;
}

createRoot(document.getElementById('root')).render(<App/>);
