(function(){
  "use strict";

  /* ---------------- DATA ---------------- */
  var LEVEL_META = {
    "สูงมาก": {cls:"crit", css:"l-crit"},
    "สูง": {cls:"high", css:"l-high"},
    "ปานกลาง": {cls:"watch", css:"l-mid"},
    "ต่ำ": {cls:"good", css:"l-low"}
  };

  var SUBS = PRC.SUBS;

  var FILTER_COMPANIES = PRC.FILTER_COMPANIES;
  var activeFilter = []; // selected companies on risk pages ([] = ทั้งหมด), multi-select
  var selectedCompany = null;
  var collapsedParents = {};
  var overviewView = "table";
  /* KPI register outline (Excel-style grouping): 1 = objective only, 2 = + Corporate KPI, 3 = all */
  var cmLevel = 1, cmObj = {}, cmDom = {}; /* 1 objective · 2 + Corporate KPI · 3 + Company KPI · 4 + company columns */
  var regFilter = {co:"ALL", dom:"ALL", lvl:"ALL", tier:"ALL"}; // KPI register filters
  /* Holding focus tiers — who drives each Strategic Objective and how often the holding (PCC) follows it */
  var TIERS = PRC.TIERS;
  var OBJ_TIER = PRC.OBJ_TIER;
  var OBJ_TIER_NOTE = PRC.OBJ_TIER_NOTE;
  function tierBadge(code){ var t=OBJ_TIER[code]; if(!t) return '';
    return '<span class="tier t'+t+'" title="'+escAttr('Tier '+t+' · '+TIERS[t].name+' — '+TIERS[t].def+(OBJ_TIER_NOTE[code]?' · '+OBJ_TIER_NOTE[code]:''))+'">T'+t+'</span>'; }
  var selectedKpi = null;
  var selectedRisk = null;
  var profileView = "objective"; // Risk Profile: "objective" (grouped by Strategic Objective) | "list" (register table)
  var regCell = null; // heat-map cell filter for the register, e.g. "3-4"
  var riskLvl = [];    // Risk Profile level filter ([] = ทั้งหมด), multi-select
  var kriSt = [];      // KRI Monitoring status filter ([] = ทั้งหมด), multi-select
  function inSel(arr, v){ return !arr.length || arr.indexOf(v)!==-1; }
  function toggleSel(arr, v){ if(v==="ALL") return []; var i=arr.indexOf(v); return i===-1 ? arr.concat([v]) : arr.slice(0,i).concat(arr.slice(i+1)); }

  function kri(name,current,appetite,tolerance,status){ return {name:name,current:current,appetite:appetite,tolerance:tolerance,status:status}; }

  var RISKS = PRC.RISKS;

  var BSC_PERSPECTIVES = PRC.BSC_PERSPECTIVES;

  var KPI_LIST = PRC.KPI_LIST;

  /* ---------------- HELPERS ---------------- */
  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c]; }); }
  function subName(id){ var s=SUBS.filter(function(x){return x.id===id;})[0]; return s?s.id:id; }
  function filteredRisks(){
    var base = RISKS.filter(function(r){ return inSel(activeFilter, r.sub); });
    if(typeof currentUser!=="undefined" && currentUser && currentUser.risks) base = base.filter(function(r){ return currentUser.risks.indexOf(r.id)!==-1; });
    return base;
  }
  /* ---------------- PAGE TOOLBAR: one pattern on every page ----------------
     Sits directly under the page header: labelled rows of chips (มุมมอง / บริษัท / …) + a "แสดง N จาก M" line. */
  function tbRow(label, inner){ return '<div class="rf-row"><span class="rf-h">'+label+'</span><div class="rf-chips">'+inner+'</div></div>'; }
  function tbSum(shown, total, unit, active){
    return '<div class="rf-sum">แสดง <b>'+shown+'</b> จาก '+total+' '+unit+(active ? ' <button type="button" class="rf-clear" data-rk="clear">ล้างตัวกรอง</button>' : '')+'</div>';
  }
  function rkChip(key,val,label,on,count){
    return '<button type="button" class="rf-chip'+(on?' on':'')+'" data-rk="'+key+'" data-val="'+val+'" aria-pressed="'+on+'">'+label+(count!=null?'<span class="rf-n">'+count+'</span>':'')+'</button>';
  }
  function scopeRisks(){ return (typeof currentUser!=="undefined" && currentUser && currentUser.risks) ? RISKS.filter(function(r){ return currentUser.risks.indexOf(r.id)!==-1; }) : RISKS; }
  // company row for risk pages; countOf(companyId|"ALL") gives the number shown on each chip
  function companyRow(countOf){
    if(lockedScope()) return tbRow('บริษัท','<span class="lock" title="ขอบเขตข้อมูลตามสิทธิ์ของคุณ">'+icon("lock")+(currentUser.risks ? 'ความเสี่ยงที่รับผิดชอบ · '+esc(currentUser.risks.join(", ")) : 'เฉพาะ '+esc(lockedScope()))+'</span>');
    return tbRow('บริษัท', rkChip('co','ALL','ทั้งหมด',!activeFilter.length)+registerCompanyCols().map(function(c){
      return rkChip('co',c.id,'<b class="mono l'+c.layer+'">'+c.id+'</b>',activeFilter.indexOf(c.id)!==-1,countOf(c.id)); }).join(''));
  }
  function exampleTag(r){ return r.example ? ' <span class="ex-tag" title="ความเสี่ยงระดับกลุ่มตัวอย่าง วิเคราะห์จาก Corporate KPI — รอ Risk Owner ยืนยัน">ตัวอย่าง</span>' : ''; }
  /* per-value example marker for REAL risks (example risks are already tagged as a whole) */
  function mockTag(r, on){ return (!r.example && on) ? ' <span class="ex-tag" title="ค่าตัวอย่าง รอข้อมูลจริงจาก Risk Owner">ตัวอย่าง</span>' : ''; }
  function emptyState(msg){
    return '<div class="empty-state"><div class="big">ไม่พบข้อมูล</div>'+esc(msg)+'</div>';
  }
  function levelPill(level){ var m=LEVEL_META[level]||{cls:"pending"}; return '<span class="pill '+m.cls+'">'+esc(level)+'</span>'; }
  function statusPill(st){
    var map={crit:["crit","เกิน Tolerance"], watch:["watch","เฝ้าระวัง"], good:["good","ปกติ"], pending:["pending","รอข้อมูล"]};
    var m=map[st]||map.pending;
    return '<span class="pill '+m[0]+'">'+m[1]+'</span>';
  }
  function levelCounts(){
    var c={"สูงมาก":0,"สูง":0,"ปานกลาง":0,"ต่ำ":0};
    RISKS.forEach(function(r){ c[r.level]++; });
    return c;
  }
  function riskCountForSub(id){ return RISKS.filter(function(r){return r.sub===id;}).length; }
  // KPI องค์กร 3 ระดับ: PCC = Corporate KPI · Parent Company (Layer 2) และ Subsidiary Company (Layer 3) ใช้ Company KPI ชุดเดียวกัน
  function kpiLevelLabel(id){
    if(id==="PCC") return "Corporate KPI";
    var s=SUBS.filter(function(x){return x.id===id;})[0];
    if(!s) return "";
    return "Company KPI";
  }
  function worstLevelForSub(id){
    var order=["สูงมาก","สูง","ปานกลาง","ต่ำ"];
    var rs=RISKS.filter(function(r){return r.sub===id;});
    if(!rs.length) return null;
    var best=order.length;
    rs.forEach(function(r){ var i=order.indexOf(r.level); if(i<best) best=i; });
    return order[best];
  }
  function perspectiveMeta(code){ return BSC_PERSPECTIVES.filter(function(p){return p.code===code;})[0]; }
  function kpisForCompany(id){ return KPI_LIST.filter(function(k){ return k.applies.indexOf(id)!==-1; }); }

  // จัดกลุ่ม KPI ของบริษัทหนึ่ง ๆ ตามมุมมอง BSC (ตามลำดับ Strategic→Financial→Customer→Internal Process→L&G→ESG) แล้วตาม Strategic Objective ภายในมุมมองนั้น
  function renderKpiGroups(list){
    var byPersp={};
    list.forEach(function(k){ (byPersp[k.persp]=byPersp[k.persp]||[]).push(k); });
    return BSC_PERSPECTIVES.filter(function(p){return byPersp[p.code];}).map(function(p){
      var items=byPersp[p.code];
      var byObj={}, objOrder=[];
      items.forEach(function(k){
        if(!byObj[k.objective]){ byObj[k.objective]=[]; objOrder.push(k.objective); }
        byObj[k.objective].push(k);
      });
      var objHtml=objOrder.map(function(obj){
        var kriHtml=byObj[obj].map(function(k){
          return '<div class="unit-card"><div class="u">'+esc(k.id)+' · '+esc(k.target)+'</div><div class="t" style="white-space:pre-line;">'+esc(k.formula)+'</div></div>';
        }).join("");
        return '<div class="kpi-objective">'+esc(obj)+'</div>'+
          '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">'+kriHtml+'</div>';
      }).join("");
      return '<div class="persp-group-head"><span class="persp-chip" style="background:'+p.color+';">'+p.code+'</span>'+
        '<span style="font-weight:700;font-size:13.5px;color:'+p.color+';">'+esc(p.name)+'</span></div>'+
        objHtml;
    }).join("");
  }

  /* ---------------- RENDER: COMPANY KPI PANEL ---------------- */
  function renderCompanyPanel(id){
    if(!id){
      return '<div class="card"><h3>เป้าหมายบริษัท</h3>'+
        '<div class="hint">คลิกที่กล่อง PCC หรือบริษัทในผัง เพื่อดูเป้าหมาย KPI ของบริษัทนั้น ตามกรอบ Balanced Scorecard 6 มุมมอง</div>'+
      '</div>';
    }
    var s=SUBS.filter(function(x){return x.id===id;})[0];
    var fc=FILTER_COMPANIES.filter(function(x){return x.id===id;})[0];
    var legalName = fc ? fc.legal : (s ? s.th : id);
    var list=kpisForCompany(id);

    var header='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'+
      '<div><div class="mono" style="font-weight:700;font-size:16.5px;">'+id+'</div><div style="font-size:13px;color:var(--ink-muted);">'+esc(legalName)+'</div></div>'+
      '<span class="lvl-tag" style="margin:0;">'+esc(kpiLevelLabel(id))+' · '+list.length+' ตัวชี้วัด</span>'+
    '</div>';

    var bodyHtml = list.length ?
      '<div style="margin-top:14px;">'+renderKpiGroups(list)+'</div>' :
      '<div style="margin-top:12px;">'+emptyState('ยังไม่มีข้อมูล KPI มาตรฐานของบริษัทนี้ในระบบ (กรอบ KPI ปัจจุบันครอบคลุม Corporate (PCC) และ Parent Company 5 บริษัท) — รอเชื่อมข้อมูลในเฟสถัดไป')+'</div>';

    return '<div class="card">'+header+bodyHtml+'</div>';
  }

  /* ---------------- RENDER: KPI REGISTER (cascade map: Corporate KPI <- Company KPI, one screen) ---------------- */
  var PARENT_COMPANIES = PRC.PARENT_COMPANIES;
  // flat company columns: each Parent Company followed by its Subsidiary Companies (Layer 2 + Layer 3 on one plane)
  function registerCompanyCols(){
    var cols=[{id:"PCC", layer:1}];
    PARENT_COMPANIES.forEach(function(pid){
      cols.push({id:pid, layer:2});
      SUBS.filter(function(x){ return x.parent===pid; }).forEach(function(k){ cols.push({id:k.id, layer:3, parent:pid}); });
    });
    return cols;
  }
  function escAttr(s){ return esc(s).replace(/"/g,"&quot;"); }
  function objectiveCode(o){ var m = /^([A-Za-z]+\d+)\./.exec(o); return m ? m[1] : o; }
  function objectiveTitle(o){ return o.replace(/^[A-Za-z]+\d+\.\s*/, ""); }
  function kpiById(id){ return KPI_LIST.filter(function(k){ return k.id===id; })[0]; }
  // Corporate KPI that is also measured, with the same definition, at the companies (one line instead of a COR + COM pair)
  function isCascade(k){ return k.level==="Corporate" && k.applies.some(function(c){ return c!=="PCC"; }); }
  // Corporate KPI -> Company KPI that roll up / drive it (explicit "drivers"; falls back to same objective)
  function buildKpiLinks(){
    var down={}, up={};
    KPI_LIST.forEach(function(k){ if(k.level!=="Corporate") up[k.id]=[]; });
    KPI_LIST.forEach(function(k){
      if(k.level!=="Corporate") return;
      var d = k.drivers || KPI_LIST.filter(function(x){ return x.level!=="Corporate" && objectiveCode(x.objective)===objectiveCode(k.objective); }).map(function(x){ return x.id; });
      down[k.id]=d;
      d.forEach(function(cid){ if(up[cid]) up[cid].push(k.id); });
    });
    return {down:down, up:up};
  }
  function registerDomains(){
    return BSC_PERSPECTIVES.map(function(p){
      var objs=[], seen={};
      KPI_LIST.forEach(function(k){
        if(k.persp!==p.code) return;
        var oc=objectiveCode(k.objective);
        if(!seen[oc]){ seen[oc]={code:oc, title:objectiveTitle(k.objective), corp:[], comp:[]}; objs.push(seen[oc]); }
        seen[oc][k.level==="Corporate"?"corp":"comp"].push(k);
      });
      return {p:p, objs:objs};
    }).filter(function(d){ return d.objs.length; });
  }
  function regMatch(k){
    if(regFilter.co!=="ALL" && k.applies.indexOf(regFilter.co)===-1) return false;
    if(regFilter.dom!=="ALL" && k.persp!==regFilter.dom) return false;
    if(regFilter.lvl!=="ALL" && k.level!==regFilter.lvl) return false;
    if(regFilter.tier!=="ALL" && String(OBJ_TIER[objectiveCode(k.objective)])!==regFilter.tier) return false;
    return true;
  }
  function regFilterBar(viewRow){
    function chip(key,val,label,extra,count){
      var on = regFilter[key]===val;
      return '<button type="button" class="rf-chip'+(on?' on':'')+'" data-rf="'+key+'" data-val="'+val+'" aria-pressed="'+on+'"'+(extra||'')+'>'+label+
        (count!=null?'<span class="rf-n">'+count+'</span>':'')+'</button>';
    }
    var cos = registerCompanyCols().map(function(c){
      var n = KPI_LIST.filter(function(k){ return k.applies.indexOf(c.id)!==-1; }).length;
      return chip('co', c.id, '<b class="mono l'+c.layer+'">'+c.id+'</b>', '', n);
    }).join('');
    var doms = BSC_PERSPECTIVES.map(function(p){
      var n = KPI_LIST.filter(function(k){ return k.persp===p.code; }).length;
      return chip('dom', p.code, '<i class="rf-dc" style="background:'+p.color+'"></i>'+esc(p.name), '', n);
    }).join('');
    var nCorp = KPI_LIST.filter(function(k){ return k.level==="Corporate"; }).length;
    var lvls = chip('lvl','Corporate','<i class="cm-sw corp"></i>Corporate KPI','',nCorp)+
               chip('lvl','Company','<i class="cm-sw comp"></i>Company KPI','',KPI_LIST.length-nCorp);
    var tiers = [1,2,3].map(function(t){
      var n = KPI_LIST.filter(function(k){ return OBJ_TIER[objectiveCode(k.objective)]===t; }).length;
      var objs = Object.keys(OBJ_TIER).filter(function(c){ return OBJ_TIER[c]===t; }).join(' ');
      return chip('tier', String(t), '<span class="tier t'+t+'">T'+t+'</span>'+TIERS[t].name, ' title="'+escAttr(TIERS[t].def+' · '+objs)+'"', n);
    }).join('');
    var shown = KPI_LIST.filter(regMatch).length;
    var active = regFilter.co!=="ALL" || regFilter.dom!=="ALL" || regFilter.lvl!=="ALL" || regFilter.tier!=="ALL";
    if(overviewView!=="table") return '<div class="rf tb">'+viewRow+'</div>';
    return '<div class="rf tb">'+viewRow+
      '<div class="rf-row"><span class="rf-h">บริษัท</span><div class="rf-chips">'+chip('co','ALL','ทั้งหมด')+cos+'</div></div>'+
      '<div class="rf-row"><span class="rf-h">Domain</span><div class="rf-chips">'+chip('dom','ALL','ทั้งหมด')+doms+'</div></div>'+
      '<div class="rf-row"><span class="rf-h">ระดับ</span><div class="rf-chips">'+chip('lvl','ALL','ทั้งหมด')+lvls+'</div></div>'+
      '<div class="rf-row"><span class="rf-h">Tier</span><div class="rf-chips">'+chip('tier','ALL','ทั้งหมด')+tiers+'</div></div>'+
      '<div class="rf-sum">แสดง <b>'+shown+'</b> จาก '+KPI_LIST.length+' KPI'+
        (regFilter.co!=="ALL" ? ' · KPI ที่ <b>'+regFilter.co+'</b> วัด' : '')+
        (active ? ' <button type="button" class="rf-clear" data-rf="clear">ล้างตัวกรอง</button>' : '')+'</div>'+
    '</div>';
  }
  function cmKpiLine(k, links){
    var isCorp = k.level==="Corporate";
    var ups = (!isCorp && links) ? (links.up[k.id]||[]) : [];
    var tip = k.id+' · '+k.target+(ups.length ? ' → ส่งผลต่อ '+ups.join(', ') : '');
    var dots = '<span class="cm-dots">'+registerCompanyCols().map(function(c){
      var on = k.applies.indexOf(c.id)!==-1;
      if(on) return '<i class="cm-dot on'+(regFilter.co===c.id?' pin':'')+'" title="'+c.id+' · ใช้ KPI นี้"></i>';
      var sameLevel = isCascade(k) ? true : (isCorp ? c.layer===1 : c.layer>=2);
      if(!sameLevel) return '<i class="cm-dot na"></i>';
      return '<i class="cm-dot" title="'+c.id+' · ไม่ใช้"></i>';
    }).join('')+'</span>';
    return '<button type="button" class="cm-kpi'+(isCorp?' corp':' comp')+(selectedKpi===k.id?' active':'')+'" data-kpi="'+k.id+'" title="'+escAttr(tip)+'">'+
      '<span class="cm-id mono">'+k.id+'</span><span class="cm-target">'+esc(k.target)+'</span>'+dots+'</button>';
  }
  function cmRowLv(){ return Math.min(cmLevel,3); }
  function cmEff(code){ return cmObj[code] || cmRowLv(); }
  function cmFull(v, ncom){ return v===3 || (v===2 && !ncom); }
  function cmLvHtml(){
    var t={1:'แสดงเฉพาะ Strategic Objective',2:'แสดงถึง Corporate KPI',3:'แสดงถึง Company KPI',4:'แสดงทั้งหมด พร้อมคอลัมน์บริษัท'};
    var clean=!Object.keys(cmObj).length && !Object.keys(cmDom).length;
    return '<span class="cm-lv" role="group" aria-label="ระดับการแสดงผล">'+[1,2,3,4].map(function(n){
      return '<button type="button" data-cmlv="'+n+'" class="'+(clean && cmLevel===n?'on':'')+'" title="'+t[n]+'">'+n+'</button>';
    }).join('')+'</span>';
  }
  /* update grouping in place (no re-render, keeps scroll) */
  function cmApply(){
    var cm=document.querySelector("#page-overview .cm"); if(!cm) return;
    cm.querySelectorAll(".cm-row[data-obj]").forEach(function(row){
      var v=cmEff(row.getAttribute("data-obj")), full=cmFull(v, +row.getAttribute("data-ncom"));
      row.classList.remove("v1","v2","v3"); row.classList.add("v"+v);
      var b=row.querySelector(".cm-tg"); if(b){ b.textContent=full?"\u2212":"+"; b.setAttribute("aria-expanded", full?"true":"false"); }
    });
    cm.querySelectorAll(".cm-domain[data-dom]").forEach(function(d){
      var shut=!!cmDom[d.getAttribute("data-dom")]; d.classList.toggle("shut", shut);
      var b=d.querySelector(".cm-dhead .cm-tg"); if(b){ b.textContent=shut?"+":"\u2212"; b.setAttribute("aria-expanded", shut?"false":"true"); }
    });
    /* company columns: keep only those with a dot among visible KPI lines; the whole group folds like an Excel column group */
    var nCol=registerCompanyCols().length, used=[], anyKpi=false;
    for(var i=0;i<nCol;i++) used.push(false);
    cm.querySelectorAll(".cm-domain[data-dom]").forEach(function(d){
      if(cmDom[d.getAttribute("data-dom")]) return;
      d.querySelectorAll(".cm-row[data-obj]").forEach(function(row){
        var v=cmEff(row.getAttribute("data-obj"));
        row.querySelectorAll(".cm-kpi").forEach(function(k){
          if(!(v===3 || (v===2 && k.classList.contains("corp")))) return;
          anyKpi=true;
          var ds=k.querySelector(".cm-dots"); if(!ds) return;
          for(var j=0;j<ds.children.length;j++) if(ds.children[j].classList.contains("on")) used[j]=true;
        });
      });
    });
    cm.classList.toggle("cm-nokpi", !anyKpi);
    var coShut = cmLevel<4; cm.classList.toggle("cm-coshut", coShut);
    cm.querySelectorAll(".cm-dots").forEach(function(ds){
      for(var j=0;j<ds.children.length;j++){ ds.children[j].classList.toggle("cx-off", !used[j]); ds.children[j].classList.toggle("cx-grp", coShut); }
    });
    clearCross();
    var clean=!Object.keys(cmObj).length && !Object.keys(cmDom).length;
    document.querySelectorAll("#page-overview [data-cmlv]").forEach(function(b){ b.classList.toggle("on", clean && +b.getAttribute("data-cmlv")===cmLevel); });
    syncStickyTop();
  }
  function renderKpiRegisterCard(){
    var domains = registerDomains();
    var links = buildKpiLinks();
    var objs=[]; domains.forEach(function(d){ objs = objs.concat(d.objs); });
    var nObj = objs.length;
    var objNoCorp = objs.filter(function(o){ return !o.corp.length; }).map(function(o){ return o.code; });
    var corpIds = Object.keys(links.down);
    var corpNoComp = corpIds.filter(function(id){ return !links.down[id].length && !isCascade(kpiById(id)); });
    var compIds = Object.keys(links.up);
    var compBad = compIds.filter(function(id){ return links.up[id].length!==1; });
    var nCorp = corpIds.length;
    var nComp = KPI_LIST.length - nCorp;
    function ruleNote(label, okCount, total, missing){
      var ok = !missing.length;
      return '<span class="cm-rule '+(ok?'ok':'gap')+'"><i class="mk">'+(ok?'&#10003;':'&#9888;')+'</i> '+label+' <b>'+okCount+'/'+total+'</b>'+(missing.length?' <span class="mono">ต้องแก้: '+missing.join(' ')+'</span>':'')+'</span>';
    }

    var stats = '<div class="cm-stats">'+
      '<span class="cm-stat"><b>'+nObj+'</b> Strategic Objective</span>'+
      '<span class="cm-stat"><b>'+KPI_LIST.length+'</b> KPI รวม</span>'+
      '<span class="cm-stat"><i class="cm-sw corp"></i><b>'+nCorp+'</b> Corporate KPI</span>'+
      '<span class="cm-stat"><i class="cm-sw comp"></i><b>'+nComp+'</b> Company KPI</span>'+
      '<span class="cm-lv-m">ย่อ/ขยาย '+cmLvHtml()+'</span>'+
    '</div>';
    var foot = '<div class="cm-foot">'+
      '<div class="cm-foot-row"><span class="cm-foot-h">ตรวจความเชื่อมโยง</span>'+
        ruleNote('ทุก Strategic Objective มี Corporate KPI', nObj-objNoCorp.length, nObj, objNoCorp)+
        ruleNote('ทุก Corporate KPI มี Company KPI รองรับ หรือวัดต่อที่บริษัท', nCorp-corpNoComp.length, nCorp, corpNoComp)+
        ruleNote('Company KPI แต่ละตัวส่งเสริม Corporate KPI 1 ตัว', compIds.length-compBad.length, compIds.length, compBad)+
      '</div>'+
      '<div class="cm-foot-row"><span class="cm-foot-h">Tier (Holding focus)</span>'+
        [1,2,3].map(function(t){ return '<span><span class="tier t'+t+'">T'+t+'</span> <b>'+TIERS[t].name+'</b> — '+esc(TIERS[t].def)+'</span>'; }).join('')+
      '</div>'+
      '<div class="cm-foot-row"><span class="cm-foot-h">สัญลักษณ์</span>'+
        '<span><i class="cm-sw corp"></i> Corporate KPI</span>'+
        '<span><i class="cm-sw comp"></i> Company KPI</span>'+
        '<span><span style="color:var(--good-line)">&#9679;</span> ใช้ KPI</span>'+
        '<span><span style="color:var(--ink-faint)">&#9675;</span> ไม่ใช้</span>'+
        '<span><span style="color:var(--brand-700);font-weight:700">&#8644;</span> KPI ที่เชื่อมโยงกัน (ชี้เมาส์ที่ KPI)</span>'+
        '<span>คลิก KPI เพื่อดูสูตรคำนวณ</span>'+
      '</div>'+
      '<div class="cm-foot-row"><span class="cm-foot-h">รูปแบบรหัส KPI</span>'+
        '<span><span class="mono">[Strategic Objective]-[ระดับ]-[ลำดับ]</span></span>'+
        '<span><span class="mono co">COR</span> = Corporate KPI (ถ้ามีจุดเขียวที่บริษัท = ใช้ตัวชี้วัดเดียวกันทั้งระดับกลุ่มและบริษัท)</span>'+
        '<span><span class="mono pc">COM</span> = Company KPI (ใช้ได้ทั้ง Parent Company และ Subsidiary Company)</span>'+
      '</div>'+
    '</div>';

    var head = '<div class="cm-head">'+
      '<div class="cm-h cm-h-dom">'+cmLvHtml()+'Domain</div>'+
      '<div class="cm-h-rows">'+
        '<div class="cm-h">Objective</div>'+
        '<div class="cm-h cm-h-kpi"><span class="cm-h-t">รายการ KPI</span>'+
          '<span class="cm-h-co"><span class="cm-dots cm-dots-head">'+registerCompanyCols().map(function(c){
            var t = c.layer===1 ? ' · Corporate (Layer 1)' : c.layer===2 ? ' · Parent Company (Layer 2)' : ' · Subsidiary Company ของ '+c.parent+' (Layer 3)';
            return '<b class="mono l'+c.layer+(regFilter.co===c.id?' pin':'')+'" title="'+c.id+t+'">'+c.id+'</b>';
          }).join('')+'</span></span></div>'+
      '</div>'+
    '</div>';

    var body = domains.map(function(d){
      var nDomObj=0, nDomKpi=0, dShut=!!cmDom[d.p.code];
      var rows = d.objs.map(function(o){
        var fc=o.corp.filter(regMatch), fm=o.comp.filter(regMatch);
        var lines = fc.map(function(k){ return cmKpiLine(k, links); }).join('') +
                    fm.map(function(k){ return cmKpiLine(k, links); }).join('');
        if(!lines) return '';
        nDomObj++; nDomKpi += fc.length+fm.length;
        var v=cmEff(o.code), full=cmFull(v, fm.length);
        lines += '<button type="button" class="cm-more m1" data-cmx="'+o.code+'">+ '+(fc.length+fm.length)+' KPI</button>'+
                 (fm.length ? '<button type="button" class="cm-more m2" data-cmx="'+o.code+'">+ '+fm.length+' Company KPI</button>' : '');
        return '<div class="cm-row v'+v+'" data-obj="'+o.code+'" data-ncom="'+fm.length+'">'+
          '<div class="cm-obj"><button type="button" class="cm-tg" data-cmobj="'+o.code+'" aria-expanded="'+full+'" title="ย่อ/ขยาย '+o.code+'">'+(full?'&minus;':'+')+'</button><span class="cm-oc mono">'+o.code+'</span><span class="cm-ot">'+esc(o.title)+' '+tierBadge(o.code)+
            (function(){ var g=risksForObjective(RISKS,o.code), n=g.primary.length+g.related.length;
              return n ? '<button type="button" class="obj-risk" data-goto-obj="'+o.code+'" title="ดูความเสี่ยงที่ผูกกับ '+o.code+' ใน Risk Profile">&#9888; '+n+' ความเสี่ยง</button>' : ''; })()+
          '</span></div>'+
          '<div class="cm-lines">'+lines+'</div>'+
        '</div>';
      }).join('');
      if(!rows) return '';
      rows += '<div class="cm-dsum">'+nDomObj+' Strategic Objective · '+nDomKpi+' KPI</div>';
      return '<div class="cm-domain'+(dShut?' shut':'')+'" data-dom="'+d.p.code+'" style="--dc:'+d.p.color+';">'+
        '<div class="cm-dhead" title="'+escAttr(purposeText(d.p.purpose))+'"><button type="button" class="cm-tg" data-cmdom="'+d.p.code+'" aria-expanded="'+!dShut+'" title="ย่อ/ขยาย Domain">'+(dShut?'+':'&minus;')+'</button><span class="persp-chip" style="background:'+d.p.color+';">'+d.p.code+'</span>'+
          '<span class="cm-dname">'+esc(d.p.name)+'<small>'+Math.round(d.p.weight*100)+'%</small></span></div>'+
        '<div class="cm-rows">'+rows+'</div>'+
      '</div>';
    }).join('');

    return '<div class="card">'+
      '<div class="card-head"><h3>ทะเบียนคุม KPI (KPI Register)</h3>'+
        '<div class="exp-btns" role="group" aria-label="ส่งออกทะเบียน KPI"><button type="button" class="btn-exp" data-export="xlsx" title="ทะเบียน KPI ตามตัวกรองที่เลือก เป็นไฟล์ Excel">'+icon("download")+'Excel</button><button type="button" class="btn-exp" data-export="pdf" title="ทะเบียน KPI ตามที่แสดงบนจอ เป็นไฟล์ PDF">'+icon("download")+'PDF</button></div></div>'+
      stats+
      '<div class="cm">'+head+(body || '<div class="cm-empty" style="padding:18px 8px;">ไม่มี KPI ที่ตรงกับตัวกรองนี้</div>')+'<div class="cm-colband" aria-hidden="true"></div></div>'+
      foot+
    '</div>';
  }
  function renderKpiDetail(id){
    var k = kpiById(id); if(!k) return '';
    var p = perspectiveMeta(k.persp);
    var oc = objectiveCode(k.objective);
    var isCorp = k.level==="Corporate";
    var lk2 = buildKpiLinks();
    var links = isCorp ? (lk2.down[k.id]||[]) : (lk2.up[k.id]||[]);
    var casc = isCascade(k);
    var linkLabel = isCorp ? 'Company KPI ที่ส่งผลต่อ KPI นี้' : 'KPI นี้ส่งผลต่อ Corporate KPI';
    var linkHtml = links.length ? links.map(function(lid){
      var lk = kpiById(lid);
      return '<button type="button" class="cm-kpi '+(isCorp?'comp':'corp')+'" data-kpi="'+lid+'"><span class="cm-id mono">'+lid+'</span><span class="cm-target">'+esc(lk.target)+'</span></button>';
    }).join('') : '<span class="cm-empty">'+(casc?'ไม่มี Company KPI แยก เพราะบริษัทวัดตัวชี้วัดเดียวกันนี้':(isCorp?'ไม่มี Company KPI':'ไม่มี Corporate KPI'))+'</span>';
    var applies = k.applies.map(function(c){ return '<span class="pill good">'+c+'</span>'; }).join(' ');
    return '<div class="card kpi-detail">'+
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+
        '<span class="persp-chip" style="background:'+p.color+';">'+p.code+'</span>'+
        '<span class="mono" style="font-weight:700;font-size:17px;">'+k.id+'</span>'+
        '<span class="lvl-tag" style="margin:0;">'+(casc?'Corporate KPI · วัดทั้งกลุ่มและบริษัท':(isCorp?'Corporate KPI · Layer 1':'Company KPI · Layer 2–3'))+'</span>'+
      '</div>'+
      '<div class="kd-label">Strategic Objective ('+esc(p.name)+')</div><div class="kd-text">'+esc(k.objective)+'</div>'+
      '<div class="kd-label">KPI &amp; เป้าหมาย</div><div class="kd-text kd-strong">'+esc(k.target)+'</div>'+
      '<div class="kd-label">นิยาม / สูตรคำนวณ</div><div class="kd-text" style="white-space:pre-line;">'+esc(k.formula)+'</div>'+
      '<div class="kd-label">บริษัทที่ใช้</div><div class="kd-text">'+applies+'</div>'+
      '<div class="kd-label">'+linkLabel+'</div><div class="kd-links">'+linkHtml+'</div>'+
    '</div>';
  }

  /* ---------------- RENDER: OVERVIEW (โครงสร้างการถือหุ้น + เป้าหมาย) ---------------- */
  function renderOverview(){
    function kpiCountPill(id, faintColor){
      var cnt=kpisForCompany(id).length;
      var faint='color:'+(faintColor||'var(--ink-faint)');
      if(!cnt) return '<span class="pill pending">รอข้อมูล KPI</span>';
      return '<span class="pill good">มีเป้าหมาย KPI</span> <span style="font-size:12px;'+faint+'">('+cnt+' ตัวชี้วัด)</span>';
    }
    function subLevelPill(s){ return kpiCountPill(s.id); }
    var topSubs=SUBS.filter(function(s){return !s.parent;});

    var orgRow=topSubs.map(function(s){
      var kids=SUBS.filter(function(c){return c.parent===s.id;});
      var expanded = kids.length>0 && !collapsedParents[s.id];
      var toggleBtn = kids.length ? '<button type="button" class="org-expand-toggle" data-parent="'+s.id+'">'+
        (expanded ? '&#9662; ซ่อน' : '&#9656; '+kids.length+' บริษัทย่อย')+'</button>' : '';
      var kidsHtml = expanded ? '<div class="org-kid-stem"></div><div class="org-kids-row">'+kids.map(function(k){
        return '<div class="org-kid'+(selectedCompany===k.id?' active':'')+'" data-sub="'+k.id+'"><div class="cid">'+k.id+'</div>'+kpiCountPill(k.id)+'</div>';
      }).join("")+'</div>' : '';
      var nodeHtml='<div class="org-node'+(s.pending?' pending':'')+(selectedCompany===s.id?' active':'')+'" data-sub="'+s.id+'">'+
        '<div class="org-node-top"><div class="id">'+s.id+'</div>'+toggleBtn+'</div>'+
        '<div class="lv">'+subLevelPill(s)+'</div>'+
      '</div>';
      return '<div class="org-branch">'+nodeHtml+kidsHtml+'</div>';
    }).join("");

    var corporateCount=kpisForCompany("PCC").length;
    var weightBarHtml=BSC_PERSPECTIVES.map(function(p){
      var pct=Math.round(p.weight*100);
      var tight = p.weight<=0.1 ? ' tight' : '';
      return '<button type="button" class="bsc-seg'+tight+'" data-dom="'+p.code+'" aria-expanded="false" aria-controls="domDetail" style="flex-grow:'+p.weight+';background:'+p.color+';">'+esc(p.name)+' = '+pct+'%</button>';
    }).join("");
    var groupCard='<div class="card kpi-level">'+
      '<span class="lvl-tag">KPI Framework · 6 Domain</span>'+
      '<div class="bsc-weight-bar" style="margin-top:12px;">'+weightBarHtml+'</div>'+
      '<div class="dom-detail" id="domDetail" role="region" aria-live="polite"><div class="dd-in"><span class="dd-hint">ชี้หรือแตะที่แถบสีเพื่อดูเป้าประสงค์ของแต่ละ Domain</span></div></div>'+
    '</div>';

    var modalHtml = selectedCompany ? (
      '<div class="modal-backdrop" id="companyModalBackdrop">'+
        '<div class="modal-box">'+
          '<button type="button" class="modal-close" id="companyModalClose" aria-label="ปิด">&times;</button>'+
          renderCompanyPanel(selectedCompany)+
        '</div>'+
      '</div>'
    ) : '';

    var orgChartCard = '<div class="card"><h3>โครงสร้างกลุ่มบริษัท (Shareholding Structure)</h3>'+
      '<div class="org-legend">'+
        '<span><i style="background:var(--layer-corp);"></i>Layer 1 &middot; Corporate (PCC)</span>'+
        '<span><i style="background:var(--layer-parent);"></i>Layer 2 &middot; Parent Company</span>'+
        '<span><i style="background:var(--layer-sub);"></i>Layer 3 &middot; Subsidiary Company</span>'+
      '</div>'+
      '<div class="org">'+
        '<div class="org-parent'+(selectedCompany==="PCC"?' active':'')+'" data-sub="PCC"><div class="n">PCC</div><div class="d">Holding · 3 สายธุรกิจ</div><div class="lv">'+kpiCountPill('PCC')+'</div></div>'+
        '<div class="org-stem"></div>'+
        '<div class="org-row">'+orgRow+'</div>'+
      '</div>'+
      '<div class="hint">คลิกบริษัทเพื่อดู KPI</div>'+
    '</div>';

    var viewToggle = '<div class="view-toggle">'+
      '<button type="button" class="view-toggle-btn'+(overviewView==="table"?' active':'')+'" data-view="table">'+icon("table")+'ทะเบียนคุม KPI</button>'+
      '<button type="button" class="view-toggle-btn'+(overviewView==="chart"?' active':'')+'" data-view="chart">'+icon("tree")+'ผังโครงสร้าง</button>'+
    '</div>';

    return ''+
    '<div class="page-head"><div><h2>เป้าหมาย KPI กลุ่มบริษัท</h2><div class="sub">Corporate KPI (PCC) &rarr; Company KPI (Parent Company / Subsidiary Company)</div></div>'+
      '</div>'+
    regFilterBar(tbRow('มุมมอง', viewToggle))+
    groupCard+
    (overviewView==="table" ? renderKpiRegisterCard() : orgChartCard)+
    modalHtml+
    (selectedKpi ? (
      '<div class="modal-backdrop" id="kpiModalBackdrop">'+
        '<div class="modal-box">'+
          '<button type="button" class="modal-close" id="kpiModalClose" aria-label="ปิด">&times;</button>'+
          renderKpiDetail(selectedKpi)+
        '</div>'+
      '</div>'
    ) : '');
  }

  /* ---------------- RENDER: MATRIX ---------------- */
  function matrixCounts(list){
    var grid={};
    list.forEach(function(r){ var k=r.L+"-"+r.I; grid[k]=(grid[k]||0)+1; });
    return grid;
  }
  function levelForLI(L,I){
    var v=L*I;
    if(v>=12) return "l-crit"; if(v>=8) return "l-high"; if(v>=6) return v===6&&L<I? "l-mid":"l-mid"; if(v>=3) return "l-mid"; return "l-low";
  }
  function levelForLICorrect(L,I){
    // follow company table exactly
    var table={
      "1-1":"l-low","1-2":"l-low","1-3":"l-mid","1-4":"l-high",
      "2-1":"l-low","2-2":"l-mid","2-3":"l-mid","2-4":"l-high",
      "3-1":"l-mid","3-2":"l-mid","3-3":"l-high","3-4":"l-crit",
      "4-1":"l-high","4-2":"l-high","4-3":"l-crit","4-4":"l-crit"
    };
    return table[L+"-"+I]||"l-low";
  }
  function renderMatrix(){
    var list=filteredRisks();
    var counts=matrixCounts(list);
    var rowsHtml="";
    for(var L=4; L>=1; L--){
      rowsHtml += '<div class="m-axis-y" style="grid-row:'+(5-L)+';grid-column:1">L='+L+'</div>';
    }
    var cellsHtml="";
    for(var Lx=4; Lx>=1; Lx--){
      for(var Ix=1; Ix<=4; Ix++){
        var n=counts[Lx+"-"+Ix]||0;
        var cls=levelForLICorrect(Lx,Ix);
        cellsHtml += (n>0
          ? '<button type="button" class="m-cell m-go '+cls+'" data-cell="'+Lx+'-'+Ix+'" style="grid-row:'+(5-Lx)+';grid-column:'+(Ix+1)+'" title="L='+Lx+' × I='+Ix+' · '+n+' ประเด็น — คลิกเพื่อดูรายชื่อในทะเบียน">'
          : '<div class="m-cell '+cls+' empty" style="grid-row:'+(5-Lx)+';grid-column:'+(Ix+1)+'" title="L='+Lx+' × I='+Ix+' · ไม่มีประเด็น">')+
          '<div class="n">'+(n>0?n:"")+'</div>'+(n>0?'</button>':'</div>');
      }
    }
    var xAxisCells='<div class="m-corner" style="grid-row:5;grid-column:1"></div>'+
      [1,2,3,4].map(function(i){ return '<div class="m-axis-x" style="grid-row:5;grid-column:'+(i+1)+'">I='+i+'</div>'; }).join("");


    var LV=["สูงมาก","สูง","ปานกลาง","ต่ำ"], LVC={"สูงมาก":"crit","สูง":"high","ปานกลาง":"watch","ต่ำ":"good"};
    function tally(rs){ var c={"สูงมาก":0,"สูง":0,"ปานกลาง":0,"ต่ำ":0}; rs.forEach(function(r){ c[r.level]++; }); return c; }
    // stacked horizontal bars: one row per group, segments by risk level (fixed order สูงมาก→ต่ำ)
    function stackRows(groups){
      var max=Math.max.apply(null, groups.map(function(g){ return g.rs.length; }).concat([1]));
      return '<div class="rs-bars">'+groups.map(function(g){
        var c=tally(g.rs), n=g.rs.length;
        var segs = LV.filter(function(l){ return c[l]; }).map(function(l){
          return '<i class="rs-seg '+LVC[l]+'" style="flex-grow:'+c[l]+'" title="'+escAttr(g.label+' · '+l+' '+c[l]+' ประเด็น')+'"></i>'; }).join('');
        return '<div class="rs-bar-row"><span class="rs-bar-lab">'+g.labelHtml+'</span>'+
          '<span class="rs-bar-track"><span class="rs-bar" style="width:'+(n/max*100)+'%">'+segs+'</span></span>'+
          '<span class="rs-bar-n mono">'+n+'</span></div>';
      }).join('')+'</div>';
    }
    var byCo = registerCompanyCols().filter(function(c){ return inSel(activeFilter, c.id); }).map(function(c){
      return {label:c.id, labelHtml:'<b class="mono l'+c.layer+'">'+c.id+'</b>', rs:list.filter(function(r){ return r.sub===c.id; })}; });
    var byDom = BSC_PERSPECTIVES.map(function(p){
      return {label:p.name, labelHtml:'<span class="persp-chip" style="background:'+p.color+';">'+p.code+'</span>'+esc(p.name), rs:list.filter(function(r){ return r.objs && r.objs[0] && r.objs[0].charAt(0)===p.code; })}; });
    var legend = '<div class="rs-key" role="note"><b>ระดับความเสี่ยง</b>'+LV.map(function(l){ return '<span><i class="rs-sw '+LVC[l]+'"></i>'+l+'</span>'; }).join('')+'</div>';
    // KRI counts for the stat tiles
    var krisAll=[]; list.forEach(function(r){ r.kris.forEach(function(k){ krisAll.push({r:r,k:k}); }); });
    var nCrit=krisAll.filter(function(o){ return o.k.status==="crit"; }).length, nWatch=krisAll.filter(function(o){ return o.k.status==="watch"; }).length, nPend=krisAll.filter(function(o){ return o.k.status==="pending"; }).length;
    var cTally=tally(list);
    var nObj=registerDomains().reduce(function(a,d){ return a+d.objs.length; },0);
    var coveredObj=registerDomains().reduce(function(a,d){ return a+d.objs.filter(function(o){ return list.some(function(r){ return r.objs && r.objs.indexOf(o.code)!==-1; }); }).length; },0);
    var scope = !activeFilter.length ? "ทั้งกลุ่ม" : (activeFilter.length<=3 ? activeFilter.join(", ") : activeFilter.length+" บริษัท");

    return ''+
    '<div class="page-head"><div><h2>ภาพรวมความเสี่ยง (Risk Summary)</h2><div class="sub">สรุปสถานะความเสี่ยงของ'+(activeFilter.length?' ':'')+scope+' สำหรับที่ประชุม President และ RMC — ระดับความเสี่ยง = โอกาสเกิด (L) × ผลกระทบ (I)</div></div>'+'</div>'+
    '<div class="rf tb">'+companyRow(function(id){ return scopeRisks().filter(function(r){ return r.sub===id; }).length; })+
      tbSum(list.length, scopeRisks().length, 'ประเด็นความเสี่ยง', activeFilter.length>0 && !lockedScope())+'</div>'+
    '<div class="grid grid-4">'+
      '<div class="stat"><div class="lbl">ประเด็นความเสี่ยง</div><div class="val mono">'+list.length+'</div><div class="rs-sub">ครอบคลุม '+coveredObj+' จาก '+nObj+' Strategic Objective</div></div>'+
      '<div class="stat crit"><div class="lbl">ระดับสูงมาก</div><div class="val mono">'+cTally["สูงมาก"]+'</div><div class="rs-sub">สูง '+cTally["สูง"]+' · ปานกลาง '+cTally["ปานกลาง"]+' · ต่ำ '+cTally["ต่ำ"]+'</div></div>'+
      '<div class="stat crit"><div class="lbl">KRI เกิน Tolerance</div><div class="val mono">'+nCrit+'</div><div class="rs-sub">เฝ้าระวัง '+nWatch+' · จาก KRI ทั้งหมด '+krisAll.length+'</div></div>'+
      (function(){ var nGood=krisAll.length-nCrit-nWatch-nPend;
        return '<div class="stat"><div class="lbl">KRI อยู่ใน Appetite</div><div class="val mono" style="color:var(--good-fg)">'+nGood+'</div><div class="rs-sub">'+(krisAll.length?Math.round(nGood/krisAll.length*100):0)+'% ของ KRI ทั้งหมด'+(nPend?' · รอข้อมูล '+nPend:'')+'</div></div>'; })()+
    '</div>'+
    legend+
    '<div class="grid rs-grid">'+
      '<div class="card">'+
        '<h3>Risk Heat Map — '+scope+' ('+list.length+' ประเด็น)</h3>'+
        '<div class="matrix">'+rowsHtml+cellsHtml+xAxisCells+'</div>'+
        '<div class="m-title" style="margin-top:6px;">แกนนอน: ผลกระทบ (Impact) · แกนตั้ง: โอกาสเกิด (Likelihood) · คลิกช่องเพื่อดูรายชื่อ</div>'+
      '</div>'+
      '<div class="card"><h3>ความเสี่ยงแยกตามบริษัท</h3>'+stackRows(byCo)+'</div>'+
      '<div class="card"><h3>ความเสี่ยงแยกตาม Domain (Strategic Objective)</h3>'+stackRows(byDom)+'</div>'+
    '</div>'+
    renderRiskModal();
  }

  /* ---------------- SHARED: RISK REGISTER TABLE ---------------- */
  var LVL_CLS={"สูงมาก":"crit","สูง":"high","ปานกลาง":"watch","ต่ำ":"good"};
  function riskSort(a,b){ return (b.L*b.I)-(a.L*a.I) || (b.L-a.L) || (a.example?1:0)-(b.example?1:0) || (a.id<b.id?-1:1); }
  function dataBadge(r){
    if(!r.example) return '<span class="db db-real" title="ข้อมูลจากเอกสารที่ RMC พิจารณาแล้ว">ข้อมูลจริง</span>';
    if(r.sub==="PCC") return '<span class="db db-pend" title="วิเคราะห์จาก Corporate KPI รอ Risk Owner ยืนยัน">รอยืนยัน</span>';
    return '<span class="db db-ex" title="ตัวอย่างเพื่อให้เห็นภาพ รอข้อมูลจริง">ตัวอย่าง</span>';
  }
  function registerTableHtml(list){
    if(!list.length) return emptyState('ไม่พบประเด็นความเสี่ยงตามเงื่อนไขนี้');
    var rows=list.slice().sort(riskSort).map(function(r){
      return '<tr class="rs-row" data-risk="'+r.id+'" title="คลิกเพื่อดูรายละเอียด">'+
        '<td class="mono rg-id">'+r.id+'</td>'+
        '<td class="rg-co">'+subName(r.sub)+'</td>'+
        '<td class="rg-title">'+esc(r.title)+'</td>'+
        '<td class="mono rgt-obj">'+(r.objs||[]).join(' · ')+'</td>'+
        '<td class="mono rg-li '+LVL_CLS[r.level]+'" title="'+escAttr(r.level)+'">'+r.L+'×'+r.I+'</td>'+
        '<td>'+dataBadge(r)+'</td>'+
        '<td class="rg-own'+(r.owner?'':' none')+'">'+esc(r.owner||'ยังไม่ระบุ')+mockTag(r, r.ownerMock)+'</td></tr>';
    }).join("");
    return '<div class="tbl-wrap"><table class="rg-tbl"><thead><tr><th>รหัส</th><th>บริษัท</th><th>ความเสี่ยง</th><th>กระทบเป้า</th><th>L×I</th><th>ข้อมูล</th><th>ผู้รับผิดชอบ</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  /* ---------------- RENDER: KRI MONITORING ---------------- */
  function renderKri(){
    var list=filteredRisks();
    var ST=[["crit","เกิน Tolerance"],["watch","เฝ้าระวัง"],["good","ปกติ"],["pending","รอข้อมูล"]];
    var stCount={crit:0,watch:0,good:0,pending:0}, totalAll=0;
    list.forEach(function(r){ r.kris.forEach(function(k){ totalAll++; stCount[k.status]=(stCount[k.status]||0)+1; }); });
    var rowsHtml = list.map(function(r){
      return r.kris.map(function(k,ki){
        if(!inSel(kriSt, k.status)) return '';
        return '<tr class="rs-row" data-risk="'+r.id+'" data-hsel="kri:'+ki+'" title="คลิกเพื่อดูกราฟประวัติ KRI"><td class="mono" style="color:var(--brand-700);white-space:nowrap;">'+r.id+exampleTag(r)+'</td>'+
          '<td style="max-width:320px;">'+(k.f && r.factors ? '<span class="kri-f" title="'+escAttr(r.factors[k.f-1].name)+'">ปัจจัย '+k.f+'</span>' : '')+esc(k.name)+(k.core?' <span class="kri-core">หลัก</span>':'')+(k.calc?'<div class="kri-calc">'+esc(k.calc)+'</div>':'')+'</td>'+
          '<td class="mono">'+esc(k.current)+mockTag(r, k.mock||k.mockTol)+'</td>'+
          '<td class="mono">'+esc(k.appetite)+'</td>'+
          '<td class="mono">'+esc(k.tolerance)+'</td>'+
          '<td><span class="kri-st">'+statusPill(k.status)+'<span class="kri-go" aria-hidden="true">'+icon("pulse")+'</span></span></td></tr>';
      }).join("");
    }).join("");
    var total = kriSt.length ? kriSt.reduce(function(a,st){ return a+(stCount[st]||0); },0) : totalAll;
    var allK=0; scopeRisks().forEach(function(r){ allK+=r.kris.length; });
    var toolbar = '<div class="rf tb">'+
      companyRow(function(id){ var n=0; scopeRisks().forEach(function(r){ if(r.sub===id) n+=r.kris.length; }); return n; })+
      tbRow('สถานะ', rkChip('st','ALL','ทั้งหมด',!kriSt.length)+ST.filter(function(t){ return t[0]!=="pending" || stCount.pending || inSel(kriSt,"pending") && kriSt.length; }).map(function(t){ return rkChip('st',t[0],'<i class="rs-sw '+({crit:'crit',watch:'watch',good:'good',pending:'na'})[t[0]]+'"></i>'+t[1],kriSt.indexOf(t[0])!==-1,stCount[t[0]]||0); }).join(''))+
      tbSum(total, allK, 'KRI', (activeFilter.length>0 && !lockedScope()) || kriSt.length>0)+'</div>';
    var tblBody = total ? ('<div class="tbl-wrap"><table><thead><tr><th>Risk ID</th><th>KRI</th><th>ค่าปัจจุบัน</th><th>Appetite</th><th>Tolerance</th><th>สถานะ</th></tr></thead>'+
      '<tbody>'+rowsHtml+'</tbody></table></div>'+
      '<div class="hint" style="margin-top:10px;">คลิกแถวเพื่อเปิดกราฟประวัติของ KRI นั้น</div>')
      : emptyState('ไม่พบ KRI ตามตัวกรองนี้');

    return ''+
    '<div class="page-head"><div><h2>KRI Monitoring</h2><div class="sub">ตัวชี้วัดความเสี่ยงหลักเทียบ Risk Appetite และ Risk Tolerance · ทุก KRI ค่ายิ่งสูงยิ่งเสี่ยง ต้องไม่เกิน Appetite — สถานะคำนวณโดย AI Agent</div></div>'+'</div>'+
    toolbar+
    '<div class="card">'+tblBody+'</div>'+
    renderRiskModal();
  }

  /* ---------------- RENDER: REGISTER DETAIL ---------------- */
  /* ---------------- INDICATOR HISTORY (risk modal) ----------------
     Simulated monthly series (18 months) until real data is connected. Quarterly = end-of-quarter snapshot. */
  var histSel = "kri:0", histPeriod = "m";
  var kbFactor = "ALL"; // KRI panel filter: "ALL" | 0 (ภาพรวม) | factor number — follows the factor opened on the left
  var HIST_MONTHS = (function(){
    var th=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."], out=[], y=2568, m=3;
    for(var i=0;i<18;i++){ out.push({label:th[m]+" "+String(y).slice(2), q:"Q"+(Math.floor(m/3)+1)+"/"+String(y).slice(2), qEnd:(m%3===2)}); m++; if(m>11){ m=0; y++; } }
    return out;
  })();
  function hNum(s){ if(!s) return null; var m=/(-?\d[\d,]*(?:\.\d+)?)/.exec(String(s)); return m ? parseFloat(m[1].replace(/,/g,"")) : null; }
  function hUnit(s){ var m=/-?\d[\d,]*(?:\.\d+)?\s*([^\s(]*(?:\s(?:บาท\/ตัน|ครั้ง\/ปี|ตัน\/ไร่|ตัน\/วัน|ลำ\/วัน|กล้า|คน|ราย|ครั้ง|เรื่อง|วัน|เท่า|โครงการ|ตำแหน่ง|รายการ|บริษัท|สัญญา\/ปี))?)/.exec(String(s||"")); return m ? m[1].replace(/^\//,"").trim() : ""; }
  function hSeed(str){ var h=2166136261; for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); } return function(){ h+=0x6D2B79F5; var t=h; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
  function histModel(name, appStr, tolStr, curStr){
    var app=hNum(appStr), tol = app===null ? null : hNum(tolStr), cur=hNum(curStr);
    var unit=hUnit(appStr)||hUnit(curStr);
    var dir; // +1 higher is better, -1 lower is better
    if(app!==null && tol!==null && app!==tol) dir = app>tol ? 1 : -1;
    else if(/≤/.test(appStr||"")) dir=-1; else if(app===0) dir=-1; else dir=1;
    var rnd=hSeed(name), n=HIST_MONTHS.length, vals=[];
    var base = Math.abs(app!==null && app!==0 ? app : (cur||10));
    var span = (app!==null && tol!==null && app!==tol) ? Math.abs(app-tol) : (base>=5 ? Math.max(base*0.12,1) : base*0.3);
    var isCount = /^(ราย|ครั้ง|เรื่อง|โครงการ|ตำแหน่ง|รายการ|บริษัท|สัญญา)/.test(unit) || (app===0 && !unit);
    if(isCount && dir===-1){
      for(var i=0;i<n;i++) vals.push(rnd()<0.18 ? 1 : 0);
      if(cur!==null) vals[n-1]=cur;
    } else {
      var end = cur!==null ? cur : (app!==null ? app - dir*span*(rnd()*1.2-0.4) : 50);
      var start = end - dir*span*(0.8+rnd()*0.8);
      for(var j=0;j<n;j++){ var t=j/(n-1); vals.push(start+(end-start)*t + (rnd()-0.5)*span*0.35); }
      vals[n-1]=end;
      var pct = /%/.test(unit) && !/จุด/.test(unit);
      var dec = base<1 ? 1000 : base<10 ? 100 : 10;
      vals = vals.map(function(v){ if(pct) v=Math.max(0,Math.min(100,v)); if(app!==null && app>=0 && v<0) v=0; return Math.abs(v)>=100 ? Math.round(v) : Math.round(v*dec)/dec; });
    }
    return {app:app, tol:tol, dir:dir, unit:unit, vals:vals, hasCur:cur!==null, appStr:appStr, tolStr:tolStr, ok:(app!==null || cur!==null)};
  }
  function hStatus(md, v){
    if(md.app===null) return "pending";
    var ok = md.dir>0 ? v>=md.app : v<=md.app;
    if(ok) return "good";
    if(md.tol===null || md.tol===md.app) return "crit"; // no buffer between appetite and tolerance
    return (md.dir>0 ? v>=md.tol : v<=md.tol) ? "watch" : "crit";
  }
  function hFmt(v, unit){ var s = Math.abs(v)>=1000 ? v.toLocaleString("en-US") : String(v); return s+(unit ? (unit==="%"?"":" ")+unit : ""); }
  // Corporate KPI target -> threshold string (e.g. "≤40%"); null when the target has no number (e.g. "≥ เป้าที่ Board กำหนด")
  function kpiThreshold(target){
    var m=/(≥|≤|=|ไม่เกิน)\s*([+\-]?\s*\d[\d,]*(?:\.\d+)?)\s*(%|จุด%|บาท\/หุ้น|ครั้ง|ราย)?/.exec(target);
    if(!m) return null;
    var op = m[1]==="ไม่เกิน" ? "≤" : m[1];
    return op+m[2].replace(/\s/g,"")+(m[3] ? (m[3]==="%"?"":" ")+m[3] : "");
  }
  function histChartSvg(md, pts, isKpi){
    var W=640,H=230,L=52,R=110,T=14,B=30, iw=W-L-R, ih=H-T-B;
    var ys=pts.map(function(p){return p.v;}); if(md.app!==null) ys.push(md.app); if(md.tol!==null) ys.push(md.tol);
    var lo=Math.min.apply(null,ys), hi=Math.max.apply(null,ys); if(hi===lo){ hi+=1; lo=Math.max(0,lo-1); }
    var pad=(hi-lo)*0.12; lo=lo-pad; hi=hi+pad; if(Math.min.apply(null,ys)>=0 && lo<0) lo=0;
    var raw=(hi-lo)/4, mag=Math.pow(10,Math.floor(Math.log10(raw))), nrm=raw/mag, step=(nrm<=1?1:nrm<=2?2:nrm<=2.5?2.5:nrm<=5?5:10)*mag;
    lo=Math.floor(lo/step)*step; hi=Math.ceil(hi/step)*step; if(Math.min.apply(null,ys)>=0 && lo<0) lo=0;
    function x(i){ return L + (pts.length===1 ? iw/2 : i*iw/(pts.length-1)); }
    function y(v){ return T + ih - (v-lo)/(hi-lo)*ih; }
    var g='';
    for(var gv=lo; gv<=hi+step/2; gv+=step){ var gy=y(gv), lab=Math.round(gv/step)*step;
      lab = Math.abs(lab)>=1000 ? Math.round(lab).toLocaleString("en-US") : String(Math.round(lab*1000)/1000);
      g+='<line x1="'+L+'" x2="'+(L+iw)+'" y1="'+gy+'" y2="'+gy+'" class="hc-grid"/><text x="'+(L-6)+'" y="'+(gy+4)+'" class="hc-ax" text-anchor="end">'+lab+'</text>'; }
    function thr(v,cls,label){ if(v===null) return ''; var ty=y(v);
      return '<line x1="'+L+'" x2="'+(L+iw)+'" y1="'+ty+'" y2="'+ty+'" class="hc-thr '+cls+'"/><text x="'+(L+iw+8)+'" y="'+(ty+4)+'" class="hc-thl">'+label+'</text>'; }
    var bands='';
    if(!isKpi && md.dir<0 && md.app!==null){
      var ya=y(Math.min(Math.max(md.app,lo),hi)), yt = (md.tol!==null && md.tol>md.app) ? y(Math.min(md.tol,hi)) : ya;
      bands = '<rect x="'+L+'" y="'+ya+'" width="'+iw+'" height="'+Math.max(0,T+ih-ya)+'" class="hc-band ok"/>'+
        (yt<ya ? '<rect x="'+L+'" y="'+yt+'" width="'+iw+'" height="'+(ya-yt)+'" class="hc-band wt"/>' : '')+
        '<rect x="'+L+'" y="'+T+'" width="'+iw+'" height="'+Math.max(0,yt-T)+'" class="hc-band cr"/>';
    }
    var th = thr(md.app,'app',isKpi?'เป้าหมาย':'Appetite') + (md.tol!==null && md.tol!==md.app ? thr(md.tol,'tol','Tolerance') : '');
    var path = pts.map(function(p,i){ return (i?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1); }).join(' ');
    var dots = pts.map(function(p,i){
      return '<circle cx="'+x(i)+'" cy="'+y(p.v)+'" r="4.5" class="hc-pt '+p.st+'"/>'+
        '<circle cx="'+x(i)+'" cy="'+y(p.v)+'" r="13" class="hist-hit" data-tip="'+escAttr(p.label+' · '+hFmt(p.v,md.unit)+' · '+({good:'ผ่าน Appetite',watch:'เฝ้าระวัง',crit:'เกิน Tolerance',pending:'ไม่มีเกณฑ์'})[p.st])+'"/>';
    }).join('');
    var xs = pts.length>8 ? 2 : 1;
    var xl = pts.map(function(p,i){ return ((pts.length-1-i)%xs===0) ? '<text x="'+x(i)+'" y="'+(H-8)+'" class="hc-ax" text-anchor="middle">'+p.label+'</text>' : ''; }).join('');
    return '<svg viewBox="0 0 '+W+' '+H+'" class="hc-svg" role="img" aria-label="กราฟประวัติตัวชี้วัด">'+bands+g+th+'<path d="'+path+'" class="hc-line"/>'+dots+xl+'</svg>';
  }
  function histSectionHtml(r){
    var items = [];
    r.kris.forEach(function(k,i){ if(!kriHasHist(r,k)) return; items.push({key:"kri:"+i, label:k.name, calc:k.calc, st:k.status, k:k, md:function(){ return histModel(r.id+"|"+k.name, k.appetite, k.tolerance, k.current); }, kind:"KRI"}); });
    (r.kpis||[]).forEach(function(id){ var k=kpiById(id); if(!k) return;
      var thr=kpiThreshold(k.target); if(!thr) return; // no numeric target yet -> nothing to plot
      items.push({key:"kpi:"+id, label:id, md:function(){ var m=histModel(id, thr, "", "—"); m.appStr=thr; return m; }, kind:"KPI", full:k.target}); });
    if(!items.length) return '';
    var allItems = items;
    if(kbFactor!=="ALL"){ var fItems = items.filter(function(it){ return it.kind==="KRI" && (kbFactor==="CORE" ? it.k.core : (it.k.f||0)===kbFactor); }); if(fItems.length) items = fItems; else kbFactor="ALL"; }
    var sel = items.filter(function(it){ return it.key===histSel; })[0] || items[0];
    histSel = sel.key;
    // factor chips: same grouping as the accordion on the left
    function grpChip(fv, label, list, tip){
      if(!list.length) return '';
      var crit=list.some(function(it){ return it.kind==="KRI" && it.st==="crit"; }), on = kbFactor===fv;
      return '<button type="button" class="kb-f'+(on?' on':'')+'" aria-pressed="'+on+'" data-kbf="'+fv+'" data-hist="'+list[0].key+'"'+(tip?' title="'+escAttr(tip)+'"':'')+'>'+(crit?'<i class="kb-fd" title="มี KRI เกิน Tolerance"></i>':'')+label+'<span>'+list.length+'</span></button>';
    }
    var kriOnly = allItems.filter(function(it){ return it.kind==="KRI"; });
    var coreList = kriOnly.filter(function(it){ return it.k.core; });
    var fChips = '<div class="kb-fs">'+
      (coreList.length ? grpChip("CORE", 'KRI หลัก', coreList, 'KRI หลักที่รายงาน President และ RMC — ที่เหลือ PSL ติดตามภายในบริษัท') : '')+
      '<button type="button" class="kb-f'+(kbFactor==="ALL"?' on':'')+'" aria-pressed="'+(kbFactor==="ALL")+'" data-kbf="ALL" data-hist="'+histSel+'">ทั้งหมด<span>'+allItems.length+'</span></button>'+
      grpChip(0, 'ภาพรวม', kriOnly.filter(function(it){ return !(it.k.f); }))+
      r.factors.map(function(f,i){ return grpChip(i+1, 'ปัจจัย '+(i+1), kriOnly.filter(function(it){ return it.k.f===i+1; }), f.name); }).join('')+
    '</div>';
    var md = sel.md();
    var pts = histPeriod==="q"
      ? HIST_MONTHS.map(function(m,i){ return {m:m,v:md.vals[i]}; }).filter(function(o){ return o.m.qEnd; }).map(function(o){ return {label:o.m.q, v:o.v}; })
      : HIST_MONTHS.slice(-12).map(function(m,i){ return {label:m.label, v:md.vals[md.vals.length-12+i]}; });
    pts.forEach(function(p){ p.st = hStatus(md, p.v); });
    if(sel.kind==="KRI" && md.hasCur && sel.st && sel.st!=="pending") pts[pts.length-1].st = sel.st; // latest point follows the status recorded in the risk register
    var last=pts[pts.length-1], prev=pts[pts.length-2], delta = prev ? Math.round((last.v-prev.v)*1000)/1000 : 0;
    var better = delta===0 ? null : ((delta>0) === (md.dir>0));
    // KRI board: every indicator of this risk at a glance (status · 12-month trend · current value), grouped by factor; click a row to chart it
    function spark(it){
      var m=it.md(), v=m.vals.slice(-12), W=76, H=22, lo=Math.min.apply(null,v), hi=Math.max.apply(null,v);
      if(m.app!==null){ lo=Math.min(lo,m.app); hi=Math.max(hi,m.app); } if(hi===lo){ hi+=1; lo-=1; }
      function x(i){ return 2+i*(W-6)/(v.length-1); } function y(val){ return 3+(H-6)*(1-(val-lo)/(hi-lo)); }
      var st = it.kind==="KRI" ? (it.st||"pending") : hStatus(m, v[v.length-1]);
      return '<svg class="kb-spark" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">'+
        (m.app!==null ? '<line x1="2" x2="'+(W-2)+'" y1="'+y(m.app).toFixed(1)+'" y2="'+y(m.app).toFixed(1)+'" class="kb-app"/>' : '')+
        '<polyline points="'+v.map(function(val,i){ return x(i).toFixed(1)+','+y(val).toFixed(1); }).join(' ')+'" class="kb-line"/>'+
        '<circle cx="'+x(v.length-1).toFixed(1)+'" cy="'+y(v[v.length-1]).toFixed(1)+'" r="2.6" class="kb-end '+st+'"/></svg>';
    }
    var ST_LBL={crit:"เกิน Tolerance",watch:"เฝ้าระวัง",good:"ปกติ",pending:"รอข้อมูล"};
    var stc={crit:0,watch:0,good:0,pending:0}; items.forEach(function(it){ if(it.kind==="KRI") stc[it.st]=(stc[it.st]||0)+1; });
    var chips = fChips+'<div class="kb">'+
      '<div class="kb-sum">'+["crit","watch","good","pending"].filter(function(k){ return k!=="pending" || stc[k]; }).map(function(k){ return '<span class="kb-s '+k+'"><i></i>'+ST_LBL[k]+' <b>'+stc[k]+'</b></span>'; }).join('')+'</div>'+
      '<div class="kb-head" aria-hidden="true"><span></span><span>KRI</span><span>แนวโน้ม</span><span>ปัจจุบัน</span><span>Appetite</span><span>Tolerance</span></div>'+
      '<div class="kb-list" role="listbox" aria-label="KRI ทั้งหมดของความเสี่ยงนี้ — เลือกเพื่อดูกราฟ">'+(function(){
        var out='';
        items.forEach(function(it){
          var st = it.kind==="KRI" ? it.st : "pending", on = it.key===sel.key;
          var val = it.kind==="KRI" ? (it.k.current && it.k.current!=="—" ? it.k.current : "—") : esc(kpiThreshold(it.full)||"");
          out+='<button type="button" class="kb-row'+(on?' on':'')+'" role="option" aria-selected="'+on+'" data-hist="'+it.key+'" title="'+escAttr((it.full||it.label)+' · '+(it.kind==="KRI"?ST_LBL[st]:'Corporate KPI'))+'">'+
            '<i class="kb-dot '+(it.kind==="KRI"?st:'kpi')+'" aria-hidden="true"></i>'+
            '<span class="kb-name">'+(it.kind==="KPI"?'<span class="hist-kind">KPI</span> ':'')+esc(it.kind==="KPI" ? it.label+' '+(it.full||'') : it.label)+(it.kind==="KRI" && it.k.core ? ' <span class="kri-core">หลัก</span>' : '')+(it.kind==="KRI" ? mockTag(r, it.k.mock||it.k.mockTol) : '')+'</span>'+
            spark(it)+'<span class="kb-val mono'+(val==="—"?' none':'')+'">'+esc(val)+'</span>'+
            (it.kind==="KRI" ? '<span class="kb-thr a mono">'+esc(it.k.appetite||"—")+'</span><span class="kb-thr t mono">'+esc(it.k.tolerance||"—")+'</span>' : '<span class="kb-thr a">เป้าหมาย</span><span class="kb-thr t"></span>')+
            '<span class="sr-only">'+(it.kind==="KRI"?ST_LBL[st]:'')+'</span></button>';
        });
        return out; })()+'</div>'+
    '</div>';
    var table = '<div class="tbl-wrap"><table class="hist-tbl"><thead><tr><th>งวด</th>'+pts.map(function(p){ return '<th>'+p.label+'</th>'; }).join('')+'</tr></thead>'+
      '<tbody><tr><td>ค่า</td>'+pts.map(function(p){ return '<td class="mono">'+hFmt(p.v,md.unit)+'</td>'; }).join('')+'</tr>'+
      '<tr><td>สถานะ</td>'+pts.map(function(p){ return '<td><i class="rp-dot '+({good:'good',watch:'watch',crit:'crit',pending:'na'})[p.st]+'" title="'+p.st+'"></i></td>'; }).join('')+'</tr></tbody></table></div>';
    return '<div class="hist" id="riskHist">'+
      '<div class="hist-top"><h4>ตัวชี้วัดความเสี่ยง (KRI)</h4>'+
        '<div class="view-toggle hist-per"><button type="button" class="view-toggle-btn'+(histPeriod==="m"?' active':'')+'" data-hper="m">'+icon("cal")+'รายเดือน</button><button type="button" class="view-toggle-btn'+(histPeriod==="q"?' active':'')+'" data-hper="q">'+icon("calq")+'รายไตรมาส</button></div></div>'+
      '<div class="hist-chips">'+chips+'</div>'+
      '<div class="hist-sum"><span class="hist-name">'+esc(sel.full||sel.label)+(sel.calc?'<span class="kri-calc">วิธีวัด: '+esc(sel.calc)+'</span>':'')+(sel.kind==="KRI"?'<span class="kri-calc">ค่ายิ่งสูง ยิ่งเสี่ยง — ต้องอยู่ต่ำกว่าเส้น Appetite</span>':'')+'</span>'+
        '<span class="hist-last"><b class="mono">'+hFmt(last.v,md.unit)+'</b> '+statusPill(last.st==="pending"?"pending":last.st)+
        (prev ? ' <span class="hist-delta '+(better===null?'':better?'up':'down')+'">'+(delta>0?'▲ +':delta<0?'▼ ':'')+(delta===0?'เท่าเดิม':hFmt(delta,md.unit))+' จาก'+(histPeriod==="q"?'ไตรมาส':'เดือน')+'ก่อน</span>' : '')+'</span>'+
        '<span class="hist-thr">'+(sel.kind==="KPI" ? 'เป้าหมาย '+esc(md.appStr) : 'Appetite '+esc(md.appStr||"—")+' · Tolerance '+esc(md.tolStr||"—"))+'</span></div>'+
      '<div class="hist-chart">'+histChartSvg(md, pts, sel.kind==="KPI")+'<div class="hist-tip" hidden></div></div>'+
      table+
      '<div class="hist-note">ข้อมูลจำลองเพื่อแสดงรูปแบบการติดตาม ยังไม่ใช่ข้อมูลจริง'+(sel.kind==="KRI" && md.hasCur ? ' · ค่าล่าสุดตรงกับค่าปัจจุบันในทะเบียน' : '')+' · รายไตรมาสใช้ค่า ณ สิ้นไตรมาส</div>'+
    '</div>';
  }
  function kriHasHist(r,k){ return histModel(r.id+"|"+k.name, k.appetite, k.tolerance, k.current).ok; }
  function renderRiskModal(){
    if(!selectedRisk) return '';
    var r=RISKS.filter(function(x){ return x.id===selectedRisk; })[0]; if(!r) return '';
    return '<div class="modal-backdrop" id="riskModalBackdrop"><div class="modal-box modal-wide">'+riskModalInner(r)+'</div></div>';
  }
  function riskModalInner(r){
    return '<button type="button" class="modal-close" id="riskModalClose" aria-label="ปิด">&times;</button>'+
      riskCardHtml(r, true).replace('class="risk-card"','class="risk-card open"');
  }
  function rerenderRiskModal(scrollToHist){
    var box=document.querySelector('[id^="page-"]:not([hidden]) #riskModalBackdrop .modal-box'); var r=RISKS.filter(function(x){ return x.id===selectedRisk; })[0];
    if(!box || !r) return;
    var st=box.scrollTop, kl=box.querySelector(".kb-list"), kst=kl?kl.scrollTop:0;
    box.innerHTML=riskModalInner(r); box.scrollTop=st;
    var kl2=box.querySelector(".kb-list"); if(kl2){ kl2.scrollTop=kst; var onr=kl2.querySelector(".kb-row.on");
      if(onr && (onr.offsetTop < kl2.scrollTop || onr.offsetTop+onr.offsetHeight > kl2.scrollTop+kl2.clientHeight)) kl2.scrollTop = onr.offsetTop - 34; }
    if(scrollToHist){ var h=document.getElementById("riskHist"); if(h) h.scrollIntoView({block:"nearest", behavior:"smooth"}); }
  }

  var factorOpen = {}; // "RISKID:index" -> bool; first factor open by default
  function factorAlert(r,i){ return r.kris.some(function(k){ return k.f===i+1 && (k.status==="crit" || k.status==="watch"); }); }
  function factorIsOpen(r,i){
    var k=r.id+":"+i; if(k in factorOpen) return factorOpen[k];
    var any=r.factors.some(function(f,j){ return factorAlert(r,j); });
    return any ? factorAlert(r,i) : i===0;
  }
  function riskActionsHtml(r){
    if(!currentUser) return '';
    var b=[];
    if(can("อัปเดตค่า KRI รายเดือน + แนบหลักฐาน", r)) b.push('<button type="button" class="ra-btn primary" data-demo="อัปเดตค่า KRI">'+icon("upload")+'อัปเดตค่า KRI</button>');
    if(can("ยืนยันค่า KRI ก่อนรายงาน", r)) b.push('<button type="button" class="ra-btn" data-demo="ยืนยันค่า KRI">'+icon("check")+'ยืนยันค่า KRI</button>');
    if(can("แก้ไขสาเหตุและแนวทางจัดการ", r)) b.push('<button type="button" class="ra-btn" data-demo="แก้ไขแนวทางจัดการ">'+icon("edit")+'แก้ไขแนวทางจัดการ</button>');
    if(can("ดู Audit Trail", r)) b.push('<button type="button" class="ra-btn" data-demo="Audit Trail">'+icon("history")+'Audit Trail</button>');
    var who='<span class="ra-who">'+avatarHtml(currentUser)+esc(roleOf().label)+'</span>';
    var ro = b.length ? '' : '<span class="ra-ro">'+icon("eye")+'ดูอย่างเดียว</span>';
    return '<div class="rm-actions">'+who+b.join('')+ro+'</div>';
  }
  function riskCardHtml(r, inModal){
    function krisOf(fn){ var out=[]; r.kris.forEach(function(k,ki){ if((k.f||0)===fn) out.push([k,ki]); }); return out; }
    function stSummary(pairs){
      var c={crit:0,watch:0}; pairs.forEach(function(p){ if(c[p[0].status]!==undefined) c[p[0].status]++; });
      return (c.crit?'<span class="rfx-st crit"><i></i>เกิน Tolerance '+c.crit+'</span>':'')+(c.watch?'<span class="rfx-st watch"><i></i>เฝ้าระวัง '+c.watch+'</span>':'');
    }
    var ulS='<ul class="rf-ul">';
    var bodyCR = (function(){
          var allOpen = r.factors.every(function(f,i){ return factorIsOpen(r,i); });
          return '<div class="rfx-top"><h4 style="font-size:14px;color:var(--brand-700);margin:0;">ปัจจัยเสี่ยงและแนวทางจัดการ ('+r.factors.length+' ปัจจัย)<span class="rfx-4t" title="กลยุทธ์ตอบสนองความเสี่ยง (4T)">4T: '+esc(r.response)+'</span></h4>'+
            (inModal ? '<button type="button" class="rfx-all" data-fall="'+(allOpen?'close':'open')+'" data-rid="'+r.id+'">'+(allOpen?'ย่อทั้งหมด':'ขยายทั้งหมด')+'</button>' : '')+'</div>'+
          '<div class="rf-list">'+r.factors.map(function(f,i){
            var fk=krisOf(i+1), nK=fk.length;
            return '<details class="rfx'+(inModal && kbFactor===i+1?' active':'')+'" data-fkey="'+r.id+':'+i+'"'+(factorIsOpen(r,i)?' open':'')+'>'+
              '<summary class="rfx-h"><span class="rf-no">'+(i+1)+'</span><span class="rfx-name">'+esc(f.name)+
                '<span class="rfx-meta">'+f.causes.length+' สาเหตุ · '+f.responses.length+' แนวทางจัดการ'+(nK?' · '+nK+' KRI':'')+stSummary(fk)+'</span></span>'+icon("chevd","rfx-chev")+'</summary>'+
              '<div class="rf-cols">'+
                '<div><div class="rf-lbl">สาเหตุ</div>'+ulS+f.causes.map(function(c){ return '<li>'+esc(c)+'</li>'; }).join('')+'</ul></div>'+
                '<div><div class="rf-lbl">แนวทางจัดการ</div>'+ulS+f.responses.map(function(c){ return '<li>'+esc(c)+'</li>'; }).join('')+'</ul></div></div>'+
              '</details>'; }).join('')+'</div>';
        })();
    var objChips = (r.objs||[]).map(function(c){ return '<span class="rg-obj mono">'+c+'</span>'; }).join('');
    return '<div class="risk-card" data-sub="'+r.sub+'">'+
      '<div class="risk-head">'+
        '<span class="rid">'+r.id+'</span>'+levelPill(r.level)+
        '<span class="rtitle">'+esc(r.title)+exampleTag(r)+'</span>'+
        '<span class="rmeta">'+subName(r.sub)+' · '+esc(r.cat)+' · L'+r.L+'×I'+r.I+'</span>'+
        '<span class="chev">&#9656;</span>'+
      '</div>'+
      '<div class="risk-body">'+(inModal ? '<div class="rm-grid"><div class="rm-main">' : '')+
        (inModal ? riskActionsHtml(r) : '')+
        (r.rmc ? '<div class="rmc-note"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3h9l3 3v11H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 9h6M7 12h6M7 15h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span>'+esc(r.rmc)+'</span></div>' : '')+
        '<div class="obj"><b>เป้าหมายกลยุทธ์ที่เชื่อมโยง:</b> '+esc(r.objective)+'</div>'+
        '<div class="risk-gov">'+
          (objChips ? '<div><span class="rg-h">Strategic Objective</span>'+objChips+'</div>' : '')+
          (r.kpis ? '<div><span class="rg-h">Corporate KPI ที่เกี่ยวข้อง</span>'+r.kpis.map(function(id){ var k=kpiById(id); return '<span class="rg-kpi mono" title="'+escAttr(k?k.target:id)+'">'+id+'</span>'; }).join('')+'</div>' : '')+
          (r.parent ? '<div><span class="rg-h">ส่งผลต่อความเสี่ยงระดับกลุ่ม</span><button type="button" class="rg-link mono" data-risk="'+r.parent+'">'+r.parent+'</button></div>' : '')+
          (function(){ var ch=RISKS.filter(function(c){ return c.parent===r.id; }); return ch.length ? '<div><span class="rg-h">ความเสี่ยงระดับบริษัทที่ส่งผล</span>'+ch.map(function(c){ return '<button type="button" class="rg-link mono" data-risk="'+c.id+'">'+c.id+'</button>'; }).join('')+'</div>' : ''; })()+
          (r.owner ? '<div><span class="rg-h">Risk Owner</span>'+esc(r.owner)+mockTag(r, r.ownerMock)+'</div>' : '')+
          (r.forum ? '<div><span class="rg-h">ติดตามใน</span>'+esc(r.forum)+'</div>' : '')+
        '</div>'+
        bodyCR+
        (inModal ? '</div><div class="rm-side">'+histSectionHtml(r)+'</div></div>' : '')+
      '</div>'+
    '</div>';
  }
  function risksForObjective(list, code){
    return {
      primary: list.filter(function(r){ return r.objs && r.objs[0]===code; }),
      related: list.filter(function(r){ return r.objs && r.objs.indexOf(code)>0; })
    };
  }
  function levelTally(rs){
    var order=["สูงมาก","สูง","ปานกลาง","ต่ำ"], c={};
    rs.forEach(function(r){ c[r.level]=(c[r.level]||0)+1; });
    return order.filter(function(l){ return c[l]; }).map(function(l){ return '<span class="pill '+LEVEL_META[l].cls+'">'+l+' '+c[l]+'</span>'; }).join(' ');
  }
  function riskScore(r){ return r.L*r.I; }
  function renderProfileByObjective(list){
    var domains = registerDomains();
    var nObj=0, gaps=[];
    var body = domains.map(function(d){
      var rows = d.objs.map(function(o){
        nObj++;
        var g = risksForObjective(list, o.code);
        var all = g.primary.concat(g.related);
        if(!all.length) gaps.push(o.code);
        var kpis = o.corp.map(function(k){ return '<div class="rp-k"><span class="rp-kid mono">'+k.id+'</span><span class="rp-kt">'+esc(k.target)+'</span></div>'; }).join('');
        function line(r, rel){
          return '<button type="button" class="rp-risk'+(rel?' rel':'')+'" data-risk="'+r.id+'">'+
            '<i class="rp-dot '+LEVEL_META[r.level].cls+'" title="'+r.level+'"></i>'+
            '<span class="rp-id mono">'+r.id+'</span>'+
            '<span class="rp-t">'+esc(r.title)+(rel?' <em>(เกี่ยวข้อง)</em>':'')+exampleTag(r)+'</span>'+
          '</button>';
        }
        var primIds = g.primary.map(function(r){ return r.id; });
        function isNested(r){ return r.parent && primIds.indexOf(r.parent)!==-1; } // nest under its group risk only when that group risk is listed here as primary
        function kids(r){ return g.primary.filter(function(c){ return c.parent===r.id; }).sort(function(a,b){ return riskScore(b)-riskScore(a); }); }
        var lines = g.primary.filter(function(r){ return !isNested(r); }).sort(function(a,b){ return riskScore(b)-riskScore(a); }).map(function(r){
                      var ch = kids(r);
                      return line(r,false) + (ch.length ? '<div class="rp-kids">'+ch.map(function(c){ return line(c,false); }).join('')+'</div>' : '');
                    }).join('')+
                    g.related.filter(function(r){ return !isNested(r); }).map(function(r){ return line(r,true); }).join('');
        return '<div class="rp-row" id="po-'+o.code+'">'+
          '<div class="rp-obj"><span class="cm-oc mono">'+o.code+'</span><span class="cm-ot">'+esc(o.title)+' '+tierBadge(o.code)+'</span></div>'+
          '<div class="rp-kpi">'+kpis+'</div>'+
          '<div class="rp-list">'+(lines || '<span class="rp-gap">ยังไม่มีความเสี่ยงที่ระบุ</span>')+'</div>'+
        '</div>';
      }).join('');
      return '<div class="rp-domain" style="--dc:'+d.p.color+';">'+
        '<div class="cm-dhead"><span class="persp-chip" style="background:'+d.p.color+';">'+d.p.code+'</span><span class="cm-dname">'+esc(d.p.name)+'</span></div>'+
        '<div class="rp-rows">'+rows+'</div>'+
      '</div>';
    }).join('');
    var head = '<div class="rp-head"><div class="cm-h">Domain</div><div class="rp-cols">'+
      '<div class="cm-h">Objective</div><div class="cm-h">Corporate KPI</div><div class="cm-h">ประเด็นความเสี่ยง</div></div></div>';
    var summary = '<div class="po-sum">ความเสี่ยงครอบคลุม <b>'+(nObj-gaps.length)+'</b> จาก '+nObj+' Strategic Objective'+
      (gaps.length ? ' · <span class="po-gap">ยังไม่มีความเสี่ยงที่ระบุ: '+gaps.join(', ')+'</span>' : '')+
      ' · คลิกที่ประเด็นเพื่อดูรายละเอียด'+
      '<span class="rp-legend"><span><i class="rp-dot crit"></i>สูงมาก</span><span><i class="rp-dot high"></i>สูง</span><span><i class="rp-dot watch"></i>ปานกลาง</span><span><i class="rp-dot good"></i>ต่ำ</span></span></div>';
    return '<div class="card">'+summary+'<div class="rp">'+head+body+'</div></div>';
  }

  /* ---------------- RENDER: RISK PROFILE ---------------- */
  function renderDetail(){
    var coList=filteredRisks();
    var list=coList.filter(function(r){ return inSel(riskLvl, r.level); });
    var toggle = '<div class="view-toggle">'+
      '<button type="button" class="view-toggle-btn pv-btn'+(profileView==="objective"?' active':'')+'" data-pview="objective">'+icon("target")+'ตาม Strategic Objective</button>'+
      '<button type="button" class="view-toggle-btn pv-btn'+(profileView==="list"?' active':'')+'" data-pview="list">'+icon("table")+'ทะเบียนความเสี่ยง</button>'+
    '</div>';
    var cnt={"สูงมาก":0,"สูง":0,"ปานกลาง":0,"ต่ำ":0};
    coList.forEach(function(r){ cnt[r.level]++; });
    var toolbar = '<div class="rf tb">'+
      tbRow('มุมมอง', toggle)+
      companyRow(function(id){ return scopeRisks().filter(function(r){ return r.sub===id; }).length; })+
      tbRow('ระดับ', rkChip('lvl','ALL','ทั้งหมด',!riskLvl.length)+["สูงมาก","สูง","ปานกลาง","ต่ำ"].map(function(l){ return rkChip('lvl',l,'<i class="rs-sw '+LVL_CLS[l]+'"></i>'+l,riskLvl.indexOf(l)!==-1,cnt[l]); }).join(''))+
      tbSum(list.length, scopeRisks().length, 'ประเด็นความเสี่ยง', (activeFilter.length>0 && !lockedScope()) || riskLvl.length>0)+'</div>';
    var body;
    if(!list.length) body = emptyState('ไม่พบประเด็นความเสี่ยงตามตัวกรองนี้');
    else if(profileView==="objective") body = renderProfileByObjective(list);
    else {
      var rl = regCell ? list.filter(function(r){ return (r.L+"-"+r.I)===regCell; }) : list;
      var cl = regCell ? regCell.split("-") : null;
      body = '<div class="card">'+
        (regCell ? '<div class="pf-filter">กรองจาก Heat Map: <span class="pf-chip">L'+cl[0]+' × I'+cl[1]+' · '+rl.length+' ประเด็น<button type="button" data-cell-clear="1" aria-label="ล้างตัวกรอง">&times;</button></span></div>' : '')+
        registerTableHtml(rl)+'<div class="hint" style="margin-top:10px;">เรียงตามคะแนน L×I จากสูงไปต่ำ · คลิกแถวเพื่อดูสาเหตุ แนวทางจัดการ KRI และกราฟประวัติ</div></div>';
    }

    return ''+
    '<div class="page-head"><div><h2>Risk Profile</h2><div class="sub">ทะเบียนความเสี่ยงที่อาจทำให้ไม่บรรลุ Strategic Objective และ Corporate KPI — คลิกที่ความเสี่ยงเพื่อดูสาเหตุ แนวทางจัดการ และ KRI</div></div>'+'</div>'+
    toolbar+
    '<div class="panel" id="riskCards">'+body+'</div>'+
    renderRiskModal();
  }

  /* ---------------- RENDER: REPORT DRAFT ---------------- */
  function renderReport(){
    var critList = [];
    RISKS.forEach(function(r){ r.kris.forEach(function(k){ if(k.status==="crit") critList.push(r.id+" — "+k.name+" ("+k.current+" เทียบ Tolerance "+k.tolerance+")"); }); });
    var critHtml = critList.map(function(c){return '<li>'+esc(c)+'</li>';}).join("");

    return ''+
    '<div class="page-head"><div><h2>ร่างรายงาน RMC (จัดทำโดย AI Agent)</h2><div class="sub">ตัวอย่างร่างรายงานก่อนนำเข้าที่ประชุม RMC — Risk Owner ตรวจทานและแก้ไขก่อนเผยแพร่จริงเสมอ</div></div></div>'+
    '<div class="report">'+
      '<div class="report-bar"><span>รายงานความเสี่ยงองค์กร — ไตรมาส 3/2569 · ร่างโดย AI Agent เมื่อ 22 ก.ย. 2569</span><span class="draft">DRAFT — รอ Risk Owner ตรวจทาน</span></div>'+
      '<div class="report-body">'+
        '<h4>1. สถานะและแนวโน้มความเสี่ยง</h4>'+
        '<p>ภาพรวมกลุ่มมีความเสี่ยงที่เปิดติดตามอยู่ 7 ประเด็น แบ่งเป็นระดับสูงมาก 4 ประเด็น (ทั้งหมดอยู่ที่ PSL) และระดับสูง 2 ประเด็น กับปานกลาง 1 ประเด็น (PEM) ความเสี่ยงกระจุกตัวชัดเจนที่ PSL จากความพร้อมของกำลังการผลิตและการจัดหาวัตถุดิบไผ่ ซึ่งเป็นสาเหตุร่วมกันของ 3 ใน 4 ประเด็น</p>'+
        '<h4>2. KRI เทียบ Appetite และ Tolerance</h4>'+
        '<p>พบ KRI ที่เกิน Tolerance แล้ว '+critList.length+' รายการ ทั้งหมดอยู่ที่ PSL:</p>'+
        '<ul>'+critHtml+'</ul>'+
        '<p>PEM ยังไม่มี KRI ที่เชื่อมข้อมูล real-time เข้าระบบ (9 จาก 9 ตัวชี้วัด) จึงยังประเมินสถานะเชิงปริมาณไม่ได้ในรอบนี้ — ควรเร่งกำหนด Data Owner ตามที่ระบุไว้ในความเสี่ยงเรื่อง Odoo ERP</p>'+
        '<h4>3. ความคืบหน้า Risk Treatment Plan</h4>'+
        '<p>PSL อยู่ระหว่างจัดหาผู้รับเหมาตัด-ขนส่งไผ่ และเร่งสรรหาบุคลากรเพิ่ม 33 คน รองรับ 3 กะ ส่วน PEM อยู่ระหว่างแต่งตั้ง Committee และ Project Manager สำหรับโครงการ Odoo ERP</p>'+
        '<h4>4. อุปสรรคและประเด็นที่ต้องตัดสินใจ</h4>'+
        '<p>ต้นทุนจัดหาไผ่ของ PSL สูงกว่าเป้าหมายอย่างมีนัยสำคัญ (ค่าแรง+ค่าขนส่งรวมสูงกว่าเป้า 5 เท่า) อาจกระทบอัตรากำไรขั้นต้นของบริษัทในปีนี้ — เสนอที่ประชุมพิจารณาอนุมัติงบจัดหาผู้รับเหมาเร่งด่วน</p>'+
        '<h4>5. Risk Incident และ Emerging Risk</h4>'+
        '<p>ยังไม่พบ Risk Incident ในรอบนี้ · Emerging Risk ที่ Agent ตรวจพบจากแนวโน้มข้อมูล: ความเสี่ยงด้านคุณภาพข้อมูล (Data Quality) จากการที่หลายบริษัทย่อยยังไม่มีระบบรายงาน KRI แบบ real-time</p>'+
      '</div>'+
    '</div>';
  }

  /* ---------------- APP ---------------- */
  /* ---------------- ICONS (inline SVG, stroke = currentColor) ---------------- */
  var IC_PATHS = {
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    list:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
    table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M9 9.5V20"/>',
    tree:'<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    calq:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 10v11M3 15.5h18"/>',
    heat:'<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" fill-opacity=".35"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" fill-opacity=".35"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor"/>',
    shield:'<path d="M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z"/><path d="M12 8v4.5M12 15.5v.5"/>',
    pulse:'<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
    flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
    lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1.2-3.5 3.6-5.2 6.5-5.2s5.3 1.7 6.5 5.2"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.9c2 .6 3.3 2.2 4 5.1"/>',
    gavel:'<path d="M14 4l6 6M11.5 6.5l6 6M13 5l-5 5 6 6 5-5M8 10l-5 5 1.5 1.5L10 12"/><path d="M13 21h8"/>',
    crown:'<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    building:'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
    clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    download:'<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    logout:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5M15 12H4"/>',
    swap:'<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    sso:'<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V8a5 5 0 0 1 10 0v3"/><circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>',
    chevd:'<path d="M6 9l6 6 6-6"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'
  };
  function icon(n, cls){ return '<svg class="ic'+(cls?' '+cls:'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(IC_PATHS[n]||'')+'</svg>'; }

  // Official Precise logos (company CI) — used as supplied: never recoloured, cropped or redrawn
  var LOGO_V = "img/logo-v.png";
  /* ---------------- LOGIN & ROLES (prototype: no real authentication) ---------------- */
  var ROLES = PRC.ROLES;
  var ROLE_ORDER = PRC.ROLE_ORDER;
  var DEMO_USERS = PRC.DEMO_USERS;
  // capability matrix: y = allowed · own = risks/companies assigned (coordinator) · mine = risks owned (owner) · other text = informational step, not a system action
  var PERMS = PRC.PERMS;
  var currentUser = null, userMenuOpen = false;
  function lockedScope(){ return currentUser && currentUser.scope!=="ALL" ? currentUser.scope : null; }
  function roleOf(u){ return ROLES[(u||currentUser||{}).role] || {}; }
  function can(cap, r){
    if(!currentUser) return false; var v = PERMS.filter(function(p){ return p.cap===cap; })[0]; if(!v) return false; v = v[currentUser.role];
    if(v==="y") return true;
    if(v==="own") return !r || currentUser.scope==="ALL" || r.sub===currentUser.scope;
    if(v==="mine") return !r || (currentUser.risks||[]).indexOf(r.id)!==-1;
    return false;
  }
  function avatarHtml(u){ return '<span class="avatar" style="background:'+roleOf(u).color+'">'+esc(u.initials)+'</span>'; }
  function renderLogin(){
    var el=document.getElementById("login");
    el.innerHTML =
      '<div class="login-side">'+
        '<div class="lg-brand"><span class="logo-plate lg"><img src="'+LOGO_V+'" alt="Precise" width="128" height="100"></span></div>'+
        '<div><h1>Risk Management Cockpit</h1><div class="lg-sub" style="margin-top:8px;">ระบบติดตามความเสี่ยงองค์กรที่เชื่อม Strategic Objective, Corporate KPI และ KRI ของทุกบริษัทในกลุ่มไว้ที่เดียว</div></div>'+
        '<div class="lg-points">'+
          '<div>'+icon("heat")+'<span>ภาพรวมความเสี่ยงทั้งกลุ่มสำหรับผู้บริหารของกลุ่มและคณะกรรมการฯ</span></div>'+
          '<div>'+icon("pulse")+'<span>KRI รายเดือนเทียบ Risk Appetite และ Tolerance</span></div>'+
          '<div>'+icon("lock")+'<span>เห็นข้อมูลตามบทบาท ความเสี่ยง และบริษัทที่รับผิดชอบ</span></div>'+
        '</div>'+
      '</div>'+
      '<div class="login-main">'+
        '<h2>เข้าสู่ระบบ</h2>'+
        '<button type="button" class="sso-btn" disabled title="เปิดใช้เมื่อเชื่อมระบบยืนยันตัวตนขององค์กร">'+icon("sso")+'เข้าสู่ระบบด้วยบัญชีองค์กร (SSO) <small>เฟสถัดไป</small></button>'+
        '<div class="lg-or">หรือเลือกบทบาทเพื่อทดลองใช้งาน</div>'+
        '<div class="role-grid">'+DEMO_USERS.map(function(u){ var ro=ROLES[u.role];
          return '<button type="button" class="role-card" data-login="'+u.id+'"><span class="role-ic" style="background:'+ro.color+'">'+icon(ro.icon)+'</span><span><b>'+esc(ro.label)+'</b><span class="rc-sub">'+esc(ro.sub)+'</span><span class="rc-d">'+esc(ro.desc)+'</span><span class="rc-scope">ทดลองเป็น '+esc(u.name)+' · '+esc(u.demo)+'</span></span></button>'; }).join('')+'</div>'+
        '<div class="lg-note">ต้นแบบสาธิต — ยังไม่มีการยืนยันตัวตนจริง ระบบจริงจะใช้ SSO ขององค์กรร่วมกับ MFA และกำหนดสิทธิ์รายบุคคลจากฝ่ายบริหารความเสี่ยง</div>'+
      '</div>';
  }
  function renderUserSlot(){
    var el=document.getElementById("userSlot"); if(!el) return;
    if(!currentUser){ el.innerHTML=''; return; }
    var ro=roleOf();
    el.innerHTML = '<button type="button" class="user-chip" id="userChip" aria-haspopup="menu" aria-expanded="'+userMenuOpen+'" title="'+escAttr(currentUser.name+' · '+ro.label)+'" aria-label="บัญชีผู้ใช้: '+escAttr(currentUser.name)+'">'+avatarHtml(currentUser)+'<span class="uc-t"><b>'+esc(currentUser.name)+'</b><small>'+esc(ro.label)+'</small></span>'+icon("chevd","chev-d")+'</button>'+
      (userMenuOpen ? '<div class="user-menu" role="menu"><div class="um-head">'+avatarHtml(currentUser)+'<div><b>'+esc(currentUser.name)+'</b><small>'+esc(ro.label)+' · '+esc(ro.sub)+'</small><small>ขอบเขต: '+esc(currentUser.demo)+'</small></div></div>'+
        '<button type="button" class="um-item" data-umenu="access" role="menuitem">'+icon("key")+'สิทธิ์ของฉัน</button>'+
        '<button type="button" class="um-item" data-umenu="switch" role="menuitem">'+icon("swap")+'สลับบทบาท (สาธิต)</button>'+
        '<button type="button" class="um-item" data-umenu="logout" role="menuitem">'+icon("logout")+'ออกจากระบบ</button></div>' : '');
  }
  function showLogin(){ var el=document.getElementById("login"); renderLogin(); el.hidden=false; document.body.style.overflow="hidden"; var f=el.querySelector(".role-card"); if(f) f.focus(); }
  function loginAs(id, restoring){
    var u=DEMO_USERS.filter(function(x){ return x.id===id; })[0]; if(!u) return;
    currentUser=u; userMenuOpen=false; selectedRisk=null;
    activeFilter = u.scope==="ALL" ? [] : [u.scope]; riskLvl=[]; kriSt=[];
    if(restoring) restoreState(); else saveState();
    try{ localStorage.setItem("prc-demo-user", u.id); }catch(err){}
    document.getElementById("login").hidden=true; document.body.style.overflow="";
    build(); renderUserSlot();
  }
  function logout(){ currentUser=null; userMenuOpen=false; try{ localStorage.removeItem("prc-demo-user"); }catch(err){} renderUserSlot(); showLogin(); }
  var toastTimer=null;
  function toast(msg){ var t=document.querySelector(".toast"); if(!t){ t=document.createElement("div"); t.className="toast"; t.setAttribute("role","status"); document.body.appendChild(t); }
    t.textContent=msg; t.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(function(){ t.hidden=true; }, 2800); }

  function renderAccess(){
    var me = currentUser ? currentUser.role : null;
    var cards = ROLE_ORDER.map(function(k){ var ro=ROLES[k], u=DEMO_USERS.filter(function(x){ return x.role===k; })[0];
      return '<div class="acc-role'+(k===me?' me':'')+'"><span class="role-ic" style="background:'+ro.color+'">'+icon(ro.icon)+'</span><div><b>'+(ROLE_ORDER.indexOf(k)+1)+'. '+esc(ro.label)+'</b>'+(k===me?'<span class="acc-me">คุณ</span>':'')+'<span class="rc-sub">'+esc(ro.sub)+'</span><p>'+esc(ro.desc)+'</p><p style="margin-top:6px;"><span class="rc-scope" style="display:inline-block;font-size:11px;font-weight:700;color:var(--brand-700);background:var(--brand-100);border-radius:4px;padding:1px 6px;">ขอบเขต: '+esc(ro.scopeText)+'</span></p></div></div>'; }).join('');
    function cell(v){ if(v==="y") return '<span class="pm-y" title="ได้">'+icon("check")+'</span>'; if(v==="own") return '<span class="pm-p">ที่ได้รับมอบหมาย</span>'; if(v==="mine") return '<span class="pm-p">ความเสี่ยงของตน</span>'; if(v) return '<span class="pm-p">'+esc(v)+'</span>'; return '<span class="pm-n">—</span>'; }
    var head = '<tr><th>สิทธิ์การใช้งาน</th>'+ROLE_ORDER.map(function(k){ return '<th class="'+(k===me?'me':'')+'">'+esc(ROLES[k].label)+'<span class="pm-sub">'+esc(ROLES[k].sub)+'</span></th>'; }).join('')+'</tr>';
    var rows = PERMS.map(function(p){ return '<tr><td>'+esc(p.cap)+'</td>'+ROLE_ORDER.map(function(k){ return '<td class="'+(k===me?'me':'')+'">'+cell(p[k])+'</td>'; }).join('')+'</tr>'; }).join('');
    var users = (me==="admin") ? '<div class="card"><h3 style="display:flex;align-items:center;gap:8px;">'+icon("users")+'ผู้ใช้ในระบบ <span class="ex-tag">ตัวอย่าง</span></h3>'+
      '<div class="tbl-wrap"><table><thead><tr><th>ผู้ใช้</th><th>บทบาท</th><th>ขอบเขต</th><th>สถานะ</th></tr></thead><tbody>'+
      DEMO_USERS.map(function(u){ return '<tr><td><span style="display:inline-flex;align-items:center;gap:8px;">'+avatarHtml(u)+esc(u.name)+'</span></td><td>'+esc(ROLES[u.role].label)+' <span style="color:var(--ink-faint);font-size:12.5px;">· '+esc(ROLES[u.role].sub)+'</span></td><td>'+esc(u.demo)+'</td><td>'+'<span class="pill good">ใช้งาน</span>'+'</td></tr>'; }).join('')+
      '</tbody></table></div><div style="margin-top:12px;"><button type="button" class="ra-btn primary" data-demo="เชิญผู้ใช้">'+icon("user")+'เชิญผู้ใช้</button></div></div>' : '';
    return ''+
    '<div class="page-head"><div><h2>Roles &amp; Access</h2><div class="sub">บทบาทผู้ใช้ ขอบเขตข้อมูล และสิทธิ์การใช้งานของระบบ — ไฮไลต์คือบทบาทที่คุณเข้าสู่ระบบอยู่</div></div></div>'+
    '<div class="acc-roles">'+cards+'</div>'+
    '<div class="card"><h3>สิทธิ์ตามบทบาท</h3><div class="tbl-wrap"><table class="perm-tbl">'+head+rows+'</table></div>'+
      '<div class="hint" style="margin-top:10px;">"ที่ได้รับมอบหมาย" = Risk Coordinator ทำได้เฉพาะความเสี่ยงหรือบริษัทย่อยที่ได้รับมอบหมาย · "ความเสี่ยงของตน" = Risk Owner ทำได้เฉพาะความเสี่ยงที่ตนเป็นเจ้าของ · ข้อความสีน้ำเงิน = บทบาทในขั้นตอนอนุมัติ · Appetite/Tolerance: Risk Owner และ Admin เสนอ → ผู้บริหารของกลุ่มทบทวน → คณะกรรมการฯ (RMC) อนุมัติในที่ประชุม → Admin บันทึกมติเข้าระบบ · คณะกรรมการฯ ใช้ระบบแบบอ่านอย่างเดียว</div></div>'+
    users+
    '<div class="card"><h3>หลักการออกแบบการเข้าถึง</h3><div class="acc-notes">'+
      '<div>'+icon("sso")+'<span><b>SSO + MFA</b> ใช้บัญชีองค์กรเดิม ไม่ต้องจำรหัสผ่านใหม่ และหมดเวลาการใช้งานอัตโนมัติเมื่อไม่ได้ใช้งาน</span></div>'+
      '<div>'+icon("layers")+'<span><b>สิทธิ์ผูกกับความเสี่ยงและบริษัท</b> Risk Owner เห็นเฉพาะความเสี่ยงที่ตนเป็นเจ้าของ Risk Coordinator เห็นเฉพาะความเสี่ยงหรือบริษัทย่อยที่ได้รับมอบหมาย</span></div>'+
      '<div>'+icon("check")+'<span><b>แยกผู้บันทึกกับผู้ยืนยัน</b> Risk Coordinator บันทึกค่า KRI → Risk Owner ยืนยัน → Admin ตรวจทานและรวบรวม → ผู้บริหารของกลุ่มทบทวน → เสนอคณะกรรมการฯ ในที่ประชุม</span></div>'+
      '<div>'+icon("history")+'<span><b>Audit Trail</b> ทุกการแก้ไขเก็บผู้แก้ วันเวลา ค่าเดิม และค่าใหม่ ให้ Internal Audit ตรวจย้อนหลังได้</span></div>'+
    '</div></div>';
  }

  var PAGES = [
    {id:"overview", label:"Objective & KPI", icon:"flag", render:renderOverview},
    {id:"matrix", label:"Risk Summary", icon:"heat", render:renderMatrix},
    {id:"detail", label:"Risk Profile", icon:"shield", render:renderDetail},
    {id:"kri", label:"KRI Monitoring", icon:"pulse", render:renderKri},
    {id:"access", label:"Roles & Access", icon:"key", render:renderAccess, nav:false}
  ];
  // ร่างรายงาน RMC (renderReport) เอาไว้ก่อนตามที่ผู้ใช้แจ้ง — ฟังก์ชันยังอยู่ในโค้ด พร้อมเพิ่มกลับเข้า PAGES ภายหลัง

  var FILTERABLE = ["matrix","kri","detail"];
  var tabnav=document.getElementById("tabnav");
  var panels=document.getElementById("panels");

  /* multi-page: each page is its own HTML file; shared state travels through sessionStorage */
  var PAGE_FILE = {overview:"index.html", matrix:"summary.html", detail:"profile.html", kri:"kri.html", access:"access.html"};
  var CUR = (window.PRC_PAGE && PAGE_FILE[window.PRC_PAGE]) ? window.PRC_PAGE : "overview";
  var STATE_KEYS = ["activeFilter","riskLvl","kriSt","profileView","regCell","overviewView","regFilter","cmLevel","histPeriod"];
  function stateGet(){ return {activeFilter:activeFilter, riskLvl:riskLvl, kriSt:kriSt, profileView:profileView, regCell:regCell, overviewView:overviewView, regFilter:regFilter, cmLevel:cmLevel, histPeriod:histPeriod}; }
  function saveState(){ try{ sessionStorage.setItem("prc-state", JSON.stringify(stateGet())); }catch(err){} }
  function restoreState(){ var st=null; try{ st=JSON.parse(sessionStorage.getItem("prc-state")||"null"); }catch(err){} if(!st) return;
    if(Array.isArray(st.activeFilter)) activeFilter=st.activeFilter; if(Array.isArray(st.riskLvl)) riskLvl=st.riskLvl; if(Array.isArray(st.kriSt)) kriSt=st.kriSt;
    if(st.profileView) profileView=st.profileView; if(st.regCell!==undefined) regCell=st.regCell; if(st.overviewView) overviewView=st.overviewView;
    if(st.regFilter) regFilter=st.regFilter; if(st.cmLevel) cmLevel=st.cmLevel; if(st.histPeriod) histPeriod=st.histPeriod;
    if(lockedScope()) activeFilter=[lockedScope()]; }
  function setPending(p){ try{ sessionStorage.setItem("prc-pending", JSON.stringify(p)); }catch(err){} }
  function runPending(){ var p=null; try{ p=JSON.parse(sessionStorage.getItem("prc-pending")||"null"); sessionStorage.removeItem("prc-pending"); }catch(err){} if(!p || p.page!==CUR) return;
    setTimeout(function(){
      if(p.t==="sub"){ var cards=document.querySelectorAll('.risk-card[data-sub="'+p.sub+'"]'); cards.forEach(function(c){ c.classList.add("open"); }); if(cards.length) cards[0].scrollIntoView({block:"center"}); }
      if(p.t==="obj"){ var el=document.getElementById("po-"+p.code); if(el) el.scrollIntoView({block:"start"}); }
    }, 30); }
  window.addEventListener("pagehide", saveState);

  function build(){
    tabnav.innerHTML = PAGES.filter(function(p){ return p.nav!==false; }).map(function(p){
      return '<a class="tab-btn'+(p.id===CUR?' active':'')+'" href="'+PAGE_FILE[p.id]+'" data-page="'+p.id+'"'+(p.id===CUR?' aria-current="page"':'')+'>'+icon(p.icon)+esc(p.label)+'</a>';
    }).join("");
    panels.innerHTML = '<section class="panel" id="page-'+CUR+'"></section>';
    document.getElementById("page-"+CUR).innerHTML = PAGES.filter(function(p){ return p.id===CUR; })[0].render();
    cmApply();
  }

  function rerenderFilterable(){
    if(lockedScope()) activeFilter=[lockedScope()];
    FILTERABLE.forEach(function(id){
      var el=document.getElementById("page-"+id);
      if(el) el.innerHTML = PAGES.filter(function(p){return p.id===id;})[0].render();
    });
    cmApply();
  }

  function rerenderOverview(){
    var el=document.getElementById("page-overview");
    if(el) el.innerHTML = PAGES.filter(function(p){return p.id==="overview";})[0].render();
    cmApply();
    if(domPinned) showDom(domPinned);
  }

  function goToPage(id){
    if(id===CUR){ window.scrollTo({top:0, behavior:"smooth"}); return; }
    saveState(); window.location.href = PAGE_FILE[id] || "index.html";
  }

  tabnav.addEventListener("click", function(e){
    var btn=e.target.closest(".tab-btn");
    if(!btn || e.metaKey || e.ctrlKey || e.shiftKey || e.button===1) { saveState(); return; }
    e.preventDefault(); goToPage(btn.getAttribute("data-page"));
  });

  panels.addEventListener("change", function(e){
    if(e.target.id==="histSelect"){ histSel=e.target.value; rerenderRiskModal(false); var hs2=document.getElementById("histSelect"); if(hs2) hs2.focus(); return; }
    var sel=e.target.closest(".company-filter");
    if(!sel) return;
    activeFilter = sel.value==="ALL" ? [] : [sel.value];
    rerenderFilterable();
  });

  function clearKpiHighlight(){
    var cm=document.querySelector(".cm"); if(!cm) return;
    cm.classList.remove("cm-focus");
    cm.querySelectorAll(".cm-hl, .cm-hl-self").forEach(function(el){ el.classList.remove("cm-hl","cm-hl-self"); });
  }
  function highlightKpi(id){
    var cm=document.querySelector(".cm"); var k=kpiById(id); if(!cm || !k) return;
    var L=buildKpiLinks();
    var rel = k.level==="Corporate" ? (L.down[id]||[]) : (L.up[id]||[]);
    clearKpiHighlight();
    cm.classList.add("cm-focus");
    cm.querySelectorAll(".cm-kpi[data-kpi]").forEach(function(el){
      var kid=el.getAttribute("data-kpi");
      if(kid===id) el.classList.add("cm-hl-self");
      else if(rel.indexOf(kid)!==-1) el.classList.add("cm-hl");
    });
  }
  /* crosshair: pointer over the company dots -> highlight that row + that company column (no link fade) */
  function clearCross(){
    var cm=document.querySelector(".cm"); if(!cm) return;
    var band=cm.querySelector(".cm-colband"); if(band) band.classList.remove("on");
    cm.querySelectorAll(".cm-xrow, .xcol, .xcell").forEach(function(el){ el.classList.remove("cm-xrow","xcol","xcell"); });
  }
  function showCross(dots, idx, row){
    var cm=document.querySelector(".cm"); if(!cm || !dots) return;
    var n=dots.children.length; if(idx<0 || idx>=n) return;
    clearCross(); clearKpiHighlight();
    var cr=cm.getBoundingClientRect(), cell=dots.children[idx].getBoundingClientRect(), w=32;
    var band=cm.querySelector(".cm-colband");
    if(band){ band.style.left=(cell.left+cell.width/2-w/2-cr.left)+"px"; band.style.width=w+"px"; band.classList.add("on"); }
    var hb=cm.querySelectorAll(".cm-dots-head b")[idx]; if(hb) hb.classList.add("xcol");
    if(row){ row.classList.add("cm-xrow"); var d=row.querySelectorAll(".cm-dot")[idx]; if(d) d.classList.add("xcell"); }
  }
  /* KPI Framework bar: hover or focus a domain segment to expand its purpose; click/tap pins it */
  var domPinned = null;
  function purposeHtml(t){ return esc(t).replace(/\*\*(.+?)\*\*/g,'<mark class="kw">$1</mark>'); }
  function purposeText(t){ return String(t||"").replace(/\*\*/g,""); }
  function showDom(code){
    var card=document.querySelector("#page-overview .kpi-level"); if(!card) return;
    var det=card.querySelector("#domDetail"), bar=card.querySelector(".bsc-weight-bar"); if(!det||!bar) return;
    var p = code ? BSC_PERSPECTIVES.filter(function(x){ return x.code===code; })[0] : null;
    bar.classList.toggle("has-on", !!p);
    bar.querySelectorAll(".bsc-seg").forEach(function(b){ var on=!!p && b.getAttribute("data-dom")===code; b.classList.toggle("on", on); b.setAttribute("aria-expanded", on?"true":"false"); });
    det.querySelector(".dd-in").innerHTML = p
      ? '<div class="dd-row" style="--dc:'+p.color+'"><span class="persp-chip" style="background:'+p.color+';">'+p.code+'</span><div><b>'+esc(p.name)+'</b><span class="dp-w">'+Math.round(p.weight*100)+'% · '+esc(p.th)+'</span><p>'+purposeHtml(p.purpose)+'</p></div></div>'
      : '<span class="dd-hint">ชี้หรือแตะที่แถบสีเพื่อดูเป้าประสงค์ของแต่ละ Domain</span>';
    det.classList.toggle("open", !!p);
  }
  panels.addEventListener("mouseover", function(e){ var sg=e.target.closest && e.target.closest(".bsc-seg[data-dom]"); if(sg) showDom(sg.getAttribute("data-dom")); });
  panels.addEventListener("mouseout", function(e){ var bar=e.target.closest && e.target.closest(".bsc-weight-bar"); if(bar && !bar.contains(e.relatedTarget)) showDom(domPinned); });
  panels.addEventListener("focusin", function(e){ var sg=e.target.closest && e.target.closest(".bsc-seg[data-dom]"); if(sg && sg.matches(":focus-visible")) showDom(sg.getAttribute("data-dom")); });
  panels.addEventListener("click", function(e){ var sg=e.target.closest(".bsc-seg[data-dom]"); if(!sg) return; var c=sg.getAttribute("data-dom"); domPinned = (domPinned===c) ? null : c; showDom(domPinned); if(!domPinned) sg.blur(); });

  panels.addEventListener("mousemove", function(e){
    var dots=e.target.closest && e.target.closest(".cm .cm-dots");
    if(!dots){ if(document.querySelector(".cm .cm-xrow, .cm .xcol")) clearCross(); return; }
    var vis=Array.prototype.filter.call(dots.children, function(c){ return getComputedStyle(c).display!=="none"; });
    if(!vis.length) return;
    var dr=dots.getBoundingClientRect();
    var vi=Math.floor((e.clientX-dr.left)/(dr.width/vis.length));
    vi=Math.max(0, Math.min(vis.length-1, vi));
    showCross(dots, Array.prototype.indexOf.call(dots.children, vis[vi]), dots.closest(".cm-kpi"));
  });
  panels.addEventListener("mouseleave", clearCross);
  function syncStickyTop(){
    var tb=document.querySelector(".topbar");
    if(tb) document.documentElement.style.setProperty("--topbar-h", tb.offsetHeight+"px");
    var h=document.querySelector(".cm-head");
    if(h && tb) h.classList.toggle("stuck", h.parentNode.getBoundingClientRect().top < tb.getBoundingClientRect().bottom - 1);
  }
  window.addEventListener("resize", syncStickyTop);
  window.addEventListener("scroll", syncStickyTop, {passive:true});
  setTimeout(syncStickyTop, 0);
  panels.addEventListener("mouseover", function(e){
    var h=e.target.closest && e.target.closest(".hist-hit"); if(!h) return;
    var box=h.closest(".hist-chart"), tip=box.querySelector(".hist-tip"), br=box.getBoundingClientRect(), hr=h.getBoundingClientRect();
    tip.textContent=h.getAttribute("data-tip"); tip.hidden=false;
    var x=hr.left+hr.width/2-br.left, y=hr.top-br.top;
    tip.style.left=Math.max(4, Math.min(x-tip.offsetWidth/2, br.width-tip.offsetWidth-4))+"px"; tip.style.top=Math.max(0,y-tip.offsetHeight-6)+"px";
  });
  panels.addEventListener("mouseout", function(e){ var h=e.target.closest && e.target.closest(".hist-hit"); if(h){ var t=h.closest(".hist-chart").querySelector(".hist-tip"); if(t) t.hidden=true; } });
  function kpiLineFrom(e){ return e.target.closest && e.target.closest(".cm .cm-kpi[data-kpi]"); }
  panels.addEventListener("mouseover", function(e){ var b=kpiLineFrom(e); if(b && !e.target.closest(".cm-dots")){ clearCross(); highlightKpi(b.getAttribute("data-kpi")); } });
  panels.addEventListener("mouseout", function(e){ var b=kpiLineFrom(e); if(b && !(e.relatedTarget && b.contains(e.relatedTarget))) clearKpiHighlight(); });
  panels.addEventListener("focusin", function(e){ var b=kpiLineFrom(e); if(b) highlightKpi(b.getAttribute("data-kpi")); });
  panels.addEventListener("focusout", function(e){ if(kpiLineFrom(e)) clearKpiHighlight(); });

  panels.addEventListener("click", function(e){
    var head=e.target.closest(".risk-head");
    if(head && !head.closest(".modal-box")){
      head.closest(".risk-card").classList.toggle("open");
      return;
    }

    var gotoBtn=e.target.closest(".btn-outline[data-sub]");
    if(gotoBtn){
      var gsub=gotoBtn.getAttribute("data-sub");
      activeFilter = [gsub];
      setPending({page:"detail", t:"sub", sub:gsub});
      goToPage("detail");
      return;
    }

    var cml=e.target.closest("[data-cmlv]");
    if(cml){ cmLevel=+cml.getAttribute("data-cmlv"); cmObj={}; cmDom={}; cmApply(); return; }
    var cmo=e.target.closest("[data-cmobj]");
    if(cmo){ var oc2=cmo.getAttribute("data-cmobj"), r2=cmo.closest(".cm-row"), full2=cmFull(cmEff(oc2), r2?+r2.getAttribute("data-ncom"):0);
      cmObj[oc2] = full2 ? 1 : 3; if(cmObj[oc2]===cmRowLv()) delete cmObj[oc2]; cmApply(); return; }
    var cmx=e.target.closest("[data-cmx]");
    if(cmx){ var oc3=cmx.getAttribute("data-cmx"); cmObj[oc3]=3; if(cmRowLv()===3) delete cmObj[oc3]; cmApply(); var t3=document.querySelector('#page-overview .cm-row[data-obj="'+oc3+'"] .cm-tg'); if(t3) t3.focus(); return; }
    var cmd=e.target.closest("[data-cmdom]");
    if(cmd){ var dc=cmd.getAttribute("data-cmdom"); if(cmDom[dc]) delete cmDom[dc]; else cmDom[dc]=true; cmApply(); return; }

    var kpiBtn=e.target.closest("[data-kpi]");
    if(kpiBtn){
      selectedKpi = kpiBtn.getAttribute("data-kpi");
      rerenderOverview();
      return;
    }
    if(e.target.closest("#kpiModalClose")){
      selectedKpi = null;
      rerenderOverview();
      return;
    }

    var modalClose=e.target.closest("#companyModalClose");
    if(modalClose){
      selectedCompany = null;
      rerenderOverview();
      return;
    }
    if(e.target.classList && e.target.classList.contains("modal-backdrop")){
      if(selectedRisk!==null){ selectedRisk=null; rerenderFilterable(); return; }
      selectedCompany = null;
      selectedKpi = null;
      rerenderOverview();
      return;
    }

    var hs=e.target.closest("[data-hist]");
    if(hs){ histSel=hs.getAttribute("data-hist"); var kf=hs.getAttribute("data-kbf");
      if(kf!==null){ kbFactor = (kf==="ALL" || kf==="CORE") ? kf : +kf; if(typeof kbFactor==="number" && kbFactor>0) focusFactor(kbFactor); }
      rerenderRiskModal(true); return; }
    var hp=e.target.closest("[data-hper]");
    if(hp){ histPeriod=hp.getAttribute("data-hper"); rerenderRiskModal(false); return; }
    var rk=e.target.closest("[data-risk]");
    if(rk){ selectedRisk=rk.getAttribute("data-risk"); histSel=rk.getAttribute("data-hsel")||"kri:0";
      var rsel=RISKS.filter(function(x){ return x.id===selectedRisk; })[0];
      kbFactor = (!rk.hasAttribute("data-hsel") && rsel && rsel.kris.some(function(k){ return k.core; })) ? "CORE" : "ALL"; rerenderFilterable();
      if(rk.hasAttribute("data-hsel") && window.innerWidth<=1100){ var hh=document.querySelector('[id^="page-"]:not([hidden]) #riskHist'); if(hh) hh.scrollIntoView({block:"start"}); }
      return; }
    if(e.target.closest("#riskModalClose")){ selectedRisk=null; rerenderFilterable(); return; }

    var pv=e.target.closest("[data-pview]");
    if(pv){ profileView=pv.getAttribute("data-pview"); regCell=null; rerenderFilterable(); return; }
    var go=e.target.closest("[data-goto-obj]");
    if(go){
      var oc=go.getAttribute("data-goto-obj");
      profileView="objective"; activeFilter=[]; riskLvl=[]; if(lockedScope()) activeFilter=[lockedScope()];
      setPending({page:"detail", t:"obj", code:oc});
      if(CUR==="detail"){ rerenderFilterable(); runPending(); } else goToPage("detail");
      return;
    }

    var rk=e.target.closest("[data-rk]");
    if(rk){
      var kk=rk.getAttribute("data-rk"), vv=rk.getAttribute("data-val");
      if(kk==="clear"){ if(!lockedScope()) activeFilter=[]; riskLvl=[]; kriSt=[]; }
      else if(kk==="co"){ activeFilter = toggleSel(activeFilter, vv); }
      else if(kk==="lvl"){ riskLvl = toggleSel(riskLvl, vv); }
      else if(kk==="st"){ kriSt = toggleSel(kriSt, vv); }
      regCell=null; rerenderFilterable(); return;
    }
    var rf=e.target.closest("[data-rf]");
    if(rf){
      var key=rf.getAttribute("data-rf");
      if(key==="clear") regFilter={co:"ALL", dom:"ALL", lvl:"ALL", tier:"ALL"};
      else { var v=rf.getAttribute("data-val"); regFilter[key] = (regFilter[key]===v && v!=="ALL") ? "ALL" : v; }
      rerenderOverview();
      return;
    }

    var viewBtn=e.target.closest(".view-toggle-btn");
    if(viewBtn){
      overviewView = viewBtn.getAttribute("data-view");
      rerenderOverview();
      return;
    }

    var toggle=e.target.closest(".org-expand-toggle");
    if(toggle){
      var pid=toggle.getAttribute("data-parent");
      collapsedParents[pid] = !collapsedParents[pid];
      rerenderOverview();
      return;
    }

    var parentBox=e.target.closest(".org-parent");
    if(parentBox){
      selectedCompany = parentBox.getAttribute("data-sub");
      rerenderOverview();
      return;
    }
    var child=e.target.closest(".org-kid");
    if(child){
      selectedCompany = child.getAttribute("data-sub");
      rerenderOverview();
      return;
    }
    var node=e.target.closest(".org-node");
    if(node){
      selectedCompany = node.getAttribute("data-sub");
      rerenderOverview();
    }
  });

  // one "active factor" shared by the accordion (left) and the KRI panel filter (right)
  function focusFactor(n){ var r=RISKS.filter(function(x){ return x.id===selectedRisk; })[0]; if(!r) return;
    r.factors.forEach(function(f,i){ factorOpen[r.id+":"+i] = (i+1===n); }); }
  var userToggleKey = null; // set when a person clicks a factor header, so render-time toggles are ignored
  function rerenderHistOnly(){
    var box=document.querySelector('[id^="page-"]:not([hidden]) #riskModalBackdrop .modal-box'); var r=RISKS.filter(function(x){ return x.id===selectedRisk; })[0];
    var h=box && box.querySelector("#riskHist"); if(!h || !r) return;
    var tmp=document.createElement("div"); tmp.innerHTML=histSectionHtml(r); if(tmp.firstElementChild) h.replaceWith(tmp.firstElementChild);
  }
  document.addEventListener("toggle", function(e){
    var d=e.target; if(!d || !d.matches || !d.matches("details.rfx[data-fkey]")) return;
    factorOpen[d.getAttribute("data-fkey")] = d.open;
    if(userToggleKey===d.getAttribute("data-fkey") && d.closest(".modal-box")){
      userToggleKey=null;
      var fi=+d.getAttribute("data-fkey").split(":")[1]+1;
      if(d.open){ kbFactor=fi; focusFactor(fi); histSel=null; } else if(kbFactor===fi){ kbFactor="ALL"; }
      rerenderRiskModal(false);
    }
    var box=d.closest(".modal-box"), btn=box && box.querySelector(".rfx-all");
    if(btn){ var all=Array.prototype.every.call(box.querySelectorAll("details.rfx"), function(x){ return x.open; });
      btn.setAttribute("data-fall", all?"close":"open"); btn.textContent = all?"ย่อทั้งหมด":"ขยายทั้งหมด"; }
  }, true);
  document.addEventListener("click", function(e){
    var gp=e.target.closest("[data-goto-page]");
    if(gp){ if(!currentUser) return; goToPage(gp.getAttribute("data-goto-page")); return; }
    var gc=e.target.closest("[data-cell]");
    if(gc){ regCell=gc.getAttribute("data-cell"); profileView="list"; riskLvl=[]; selectedRisk=null; if(CUR==="detail") rerenderFilterable(); else goToPage("detail"); return; }
    if(e.target.closest("[data-goto-reg]")){ regCell=null; profileView="list"; riskLvl=[]; selectedRisk=null; if(CUR==="detail") rerenderFilterable(); else goToPage("detail"); return; }
    if(e.target.closest("[data-cell-clear]")){ regCell=null; rerenderFilterable(); return; }
    var fsum=e.target.closest("details.rfx[data-fkey] > summary"); if(fsum){ userToggleKey=fsum.parentNode.getAttribute("data-fkey"); }
    var fa=e.target.closest("[data-fall]");
    if(fa){ var openAll=fa.getAttribute("data-fall")==="open", box=fa.closest(".modal-box");
      if(box) box.querySelectorAll("details.rfx").forEach(function(d){ d.open=openAll; d.classList.remove("active"); });
      if(kbFactor!=="ALL"){ kbFactor="ALL"; rerenderHistOnly(); }
      return; }
    var lg=e.target.closest("[data-login]"); if(lg){ loginAs(lg.getAttribute("data-login")); return; }
    if(e.target.closest("#userChip")){ userMenuOpen=!userMenuOpen; renderUserSlot(); return; }
    var um=e.target.closest("[data-umenu]");
    if(um){ var a=um.getAttribute("data-umenu"); userMenuOpen=false; renderUserSlot();
      if(a==="access") goToPage("access"); else logout(); return; }
    if(userMenuOpen && !e.target.closest(".user-menu")){ userMenuOpen=false; renderUserSlot(); }
    var dm=e.target.closest("[data-demo]"); if(dm){ toast(dm.getAttribute("data-demo")+" — ต้นแบบ: จะบันทึกได้เมื่อเชื่อมฐานข้อมูลในเฟสถัดไป"); return; }
  });
  document.addEventListener("keydown", function(e){
    if(e.key==="Escape" && userMenuOpen){ userMenuOpen=false; renderUserSlot(); var c=document.getElementById("userChip"); if(c) c.focus(); return; }
    if(e.key==="Escape" && selectedRisk!==null){ selectedRisk=null; rerenderFilterable(); return; }
    if(e.key==="Escape" && (selectedCompany!==null || selectedKpi!==null)){
      selectedCompany = null;
      selectedKpi = null;
      rerenderOverview();
    }
  });

  /* ---------------- EXPORT (Objective & KPI) ---------------- */
  var LIBS = {
    xlsx:"https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
    h2c:"https://cdn.jsdelivr.net/npm/html2canvas-pro@2.4.5/dist/html2canvas-pro.min.js",
    pdf:"https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
  };
  var libP = {};
  function loadLib(k){
    if(!libP[k]) libP[k] = new Promise(function(res, rej){
      var sc=document.createElement("script"); sc.src=LIBS[k]; sc.onload=function(){ res(); };
      sc.onerror=function(){ libP[k]=null; rej(new Error("lib")); }; document.head.appendChild(sc);
    });
    return libP[k];
  }
  /* inside the claude.ai viewer a page may not start downloads itself — the downloads capability asks the viewer instead */
  var dlP = (window.claude && typeof window.claude.use==="function") ? window.claude.use("downloads").catch(function(){ return null; }) : Promise.resolve(null);
  function saveFile(name, blob){
    return dlP.then(function(dl){
      if(dl) return dl.save({filename:name, data:blob}).then(function(){ toast("บันทึก "+name+" แล้ว"); }, function(err){
        if(err && err.code==="declined") return; toast("บันทึกไฟล์ในมุมมองนี้ไม่ได้"); });
      var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    });
  }
  function beDate(){ var d=new Date(); function z(n){ return (n<10?"0":"")+n; } return (d.getFullYear()+543)+"-"+z(d.getMonth()+1)+"-"+z(d.getDate()); }
  function regFilterText(){
    var t=[];
    if(regFilter.co!=="ALL") t.push("บริษัท "+regFilter.co);
    if(regFilter.dom!=="ALL"){ var dp=BSC_PERSPECTIVES.filter(function(x){ return x.code===regFilter.dom; })[0]; t.push("Domain "+(dp?dp.name:regFilter.dom)); }
    if(regFilter.lvl!=="ALL") t.push(regFilter.lvl+" KPI");
    if(regFilter.tier!=="ALL") t.push("Tier "+regFilter.tier);
    return t.length ? t.join(" · ") : "ทั้งหมด";
  }
  function exportBusy(kind, on){
    document.querySelectorAll('[data-export="'+kind+'"]').forEach(function(b){ b.disabled=on; b.classList.toggle("busy", on); });
  }
  function exportXlsx(){
    exportBusy("xlsx", true);
    loadLib("xlsx").then(function(){
      var wb=new window.ExcelJS.Workbook(); wb.creator="PRECISE Risk Management Cockpit"; wb.created=new Date();
      var cols=registerCompanyCols(), links=buildKpiLinks(), NAVY="FF1E2761", LINE={style:"thin", color:{argb:"FFD5DAE3"}};
      var FONT={name:"Tahoma", size:10};
      function hex(c){ return "FF"+String(c||"#888888").replace("#","").toUpperCase(); }
      function box(cell){ cell.border={top:LINE, left:LINE, bottom:LINE, right:LINE}; }
      /* sheet 1: KPI register */
      var ws=wb.addWorksheet("ทะเบียน KPI", {views:[{state:"frozen", xSplit:6, ySplit:4}], pageSetup:{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9}});
      var head=["Domain","น้ำหนัก","Objective","ชื่อ Objective","Tier","รหัส KPI","ระดับ","KPI & เป้าหมาย","นิยาม / สูตรคำนวณ","ส่งผลต่อ / รวมจาก"].concat(cols.map(function(c){ return c.id; }));
      var widths=[16,8,9,42,6,12,11,50,64,24].concat(cols.map(function(){ return 6.5; }));
      ws.columns = widths.map(function(w){ return {width:w}; });
      ws.getCell("A1").value="ทะเบียนคุม KPI (KPI Register) — PRECISE"; ws.getCell("A1").font={name:"Tahoma", size:14, bold:true, color:{argb:NAVY}};
      ws.getCell("A2").value="ข้อมูล ณ 17 ก.ย. 2569 · ส่งออกเมื่อ "+beDate()+" · ตัวกรอง: "+regFilterText(); ws.getCell("A2").font={name:"Tahoma", size:10, color:{argb:"FF5B6472"}};
      var hr=ws.getRow(4); hr.values=head; hr.height=22;
      hr.eachCell(function(c, i){ c.font={name:"Tahoma", size:10, bold:true, color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern", pattern:"solid", fgColor:{argb:NAVY}}; c.alignment={vertical:"middle", horizontal:i>10?"center":"left", wrapText:true}; box(c); });
      var r=5, n=0;
      registerDomains().forEach(function(d){
        d.objs.forEach(function(o){
          o.corp.concat(o.comp).filter(regMatch).forEach(function(k){
            var isCorp=k.level==="Corporate", rel=isCorp ? (links.down[k.id]||[]) : (links.up[k.id]||[]);
            var row=ws.getRow(r);
            row.values=[d.p.code+" · "+d.p.name, d.p.weight, o.code, o.title, "T"+(OBJ_TIER[o.code]||""), k.id, isCorp?"Corporate":"Company", k.target, k.formula||"", (rel.length ? (isCorp?"รวมจาก ":"→ ")+rel.join(", ") : "")].concat(cols.map(function(c){ return k.applies.indexOf(c.id)!==-1 ? "●" : ""; }));
            row.eachCell({includeEmpty:true}, function(c, i){
              c.font=FONT; c.alignment={vertical:"top", wrapText:i<=10, horizontal:i>10||i===2||i===3||i===5?"center":"left"}; box(c);
              if(i>10 && c.value) c.font={name:"Tahoma", size:10, color:{argb:"FF1A9A51"}};
            });
            row.getCell(1).fill={type:"pattern", pattern:"solid", fgColor:{argb:hex(d.p.color)}}; row.getCell(1).font={name:"Tahoma", size:10, bold:true, color:{argb:"FFFFFFFF"}};
            row.getCell(2).numFmt="0%";
            if(isCorp){ [6,7,8].forEach(function(i){ row.getCell(i).fill={type:"pattern", pattern:"solid", fgColor:{argb:"FFEEF1FB"}}; }); row.getCell(8).font={name:"Tahoma", size:10, bold:true}; }
            row.getCell(6).font={name:"Consolas", size:10, bold:true, color:{argb:isCorp?"FF4F63D2":"FF1E2761"}};
            r++; n++;
          });
        });
      });
      ws.autoFilter={from:{row:4, column:1}, to:{row:4, column:head.length}};
      /* sheet 2: objectives */
      var wo=wb.addWorksheet("Objective", {views:[{state:"frozen", ySplit:1}]});
      wo.columns=[{width:16},{width:8},{width:60},{width:9},{width:48},{width:6},{width:22},{width:12},{width:12},{width:12}];
      var oh=wo.getRow(1); oh.values=["Domain","น้ำหนัก","เป้าประสงค์ของ Domain","Objective","ชื่อ Objective","Tier","ระดับ Tier","Corporate KPI","Company KPI","ความเสี่ยง"]; oh.height=22;
      oh.eachCell(function(c){ c.font={name:"Tahoma", size:10, bold:true, color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern", pattern:"solid", fgColor:{argb:NAVY}}; c.alignment={vertical:"middle", wrapText:true}; box(c); });
      var ro=2;
      registerDomains().forEach(function(d){
        d.objs.forEach(function(o){
          var t=OBJ_TIER[o.code], g=risksForObjective(RISKS,o.code);
          var row=wo.getRow(ro); row.values=[d.p.code+" · "+d.p.name, d.p.weight, purposeText(d.p.purpose), o.code, o.title, t?"T"+t:"", t?TIERS[t].name:"", o.corp.length, o.comp.length, g.primary.length+g.related.length];
          row.eachCell({includeEmpty:true}, function(c, i){ c.font=FONT; c.alignment={vertical:"top", wrapText:true, horizontal:(i===2||i>=6&&i!==7)?"center":"left"}; box(c); });
          row.getCell(1).fill={type:"pattern", pattern:"solid", fgColor:{argb:hex(d.p.color)}}; row.getCell(1).font={name:"Tahoma", size:10, bold:true, color:{argb:"FFFFFFFF"}};
          row.getCell(2).numFmt="0%"; ro++;
        });
      });
      ro++;
      [1,2,3].forEach(function(t){ var row=wo.getRow(ro++); row.getCell(1).value="T"+t+" · "+TIERS[t].name; row.getCell(1).font={name:"Tahoma", size:10, bold:true}; row.getCell(3).value=TIERS[t].def; row.getCell(3).font=FONT; });
      return wb.xlsx.writeBuffer().then(function(buf){
        return saveFile("PRECISE_KPI_Register_"+beDate()+".xlsx", new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      });
    }).catch(function(){ toast("สร้างไฟล์ Excel ไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่"); })
      .then(function(){ exportBusy("xlsx", false); });
  }
  function exportPdf(){
    exportBusy("pdf", true);
    var root=document.documentElement, prevTheme=root.getAttribute("data-theme"), sheet=null;
    Promise.all([loadLib("h2c"), loadLib("pdf")]).then(function(){
      var page=document.getElementById("page-overview"); if(!page) throw new Error("page");
      sheet=document.createElement("div"); sheet.className="pdf-sheet";
      sheet.innerHTML='<div class="pdf-head"><img src="'+LOGO_V+'" alt=""><div><h2>ทะเบียนคุม KPI (KPI Register)</h2><div>ข้อมูล ณ 17 ก.ย. 2569 · ส่งออกเมื่อ '+beDate()+' · ตัวกรอง: '+esc(regFilterText())+'</div></div></div>';
      var reg=page.querySelector(".cm"); reg=reg && reg.closest(".card"); if(!reg) throw new Error("register");
      var rc=reg.cloneNode(true); var ch=rc.querySelector(".card-head"); if(ch) ch.remove(); sheet.appendChild(rc);
      sheet.querySelectorAll(".dom-detail, .cm-colband, .modal-backdrop, .cm-lv-m").forEach(function(x){ x.remove(); });
      root.setAttribute("data-theme","light");
      document.body.appendChild(sheet);
      var sr=sheet.getBoundingClientRect(), cuts=[];
      sheet.querySelectorAll(".card, .cm-domain, .cm-row, .cm-foot-row, .cm-dhead, .org-row, .org-kids-row").forEach(function(el){ cuts.push(el.getBoundingClientRect().bottom - sr.top); });
      cuts.sort(function(a,b){ return a-b; });
      return window.html2canvas(sheet, {scale:2, backgroundColor:"#ffffff", useCORS:true, logging:false, windowWidth:sheet.scrollWidth}).then(function(canvas){
        var jsPDF=window.jspdf.jsPDF, pdf=new jsPDF({orientation:"landscape", unit:"mm", format:"a4"});
        var M=10, W=297-2*M, H=210-2*M-6, k=canvas.width/W, pageH=H*k, scale=canvas.height/sr.height;
        var bounds=cuts.map(function(y){ return Math.round(y*scale); }), y=0, pages=[];
        while(y < canvas.height-2){
          var lim=y+pageH, cut=lim;
          if(lim < canvas.height){ var ok=bounds.filter(function(b){ return b>y+pageH*0.35 && b<=lim; }); if(ok.length) cut=ok[ok.length-1]; } else cut=canvas.height;
          pages.push([y, cut]); y=cut;
        }
        pages.forEach(function(pg, i){
          var h=pg[1]-pg[0], part=document.createElement("canvas"); part.width=canvas.width; part.height=h;
          var ctx=part.getContext("2d"); ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,part.width,h); ctx.drawImage(canvas, 0, pg[0], canvas.width, h, 0, 0, canvas.width, h);
          if(i) pdf.addPage();
          pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", M, M, W, h/k);
          pdf.setFontSize(8); pdf.setTextColor(120); pdf.text("PRECISE Risk Management Cockpit  ·  "+(i+1)+" / "+pages.length, 297-M, 210-6, {align:"right"});
        });
        return saveFile("PRECISE_KPI_Register_"+beDate()+".pdf", pdf.output("blob"));
      });
    }).catch(function(){ toast("สร้างไฟล์ PDF ไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่"); })
      .then(function(){
        if(sheet) sheet.remove();
        if(prevTheme===null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", prevTheme);
        exportBusy("pdf", false);
      });
  }
  document.addEventListener("click", function(e){
    var ex=e.target.closest && e.target.closest("[data-export]"); if(!ex || ex.disabled) return;
    if(ex.getAttribute("data-export")==="xlsx") exportXlsx(); else exportPdf();
  });

  /* start */
  (function(){ var saved=null; try{ saved=localStorage.getItem("prc-demo-user"); }catch(err){}
    if(saved && DEMO_USERS.some(function(u){ return u.id===saved; })){ loginAs(saved, true); runPending(); } else { build(); showLogin(); } })();
})();
