/* PRECISE Risk Management Cockpit — ข้อมูล: บริษัทในกลุ่ม · ใช้ทุกหน้า */
window.PRC = window.PRC || {};

PRC.SUBS = [
    {id:"PEM", name:"Precise Electric Manufacturing", th:"บริษัท พรีไซซ อีเลคตริค แมนูแฟคเจอริ่ง จำกัด", est:2529, line:"Smart Grid", pending:false, parent:null},
    {id:"PSP", name:"Precise System & Project", th:"บริษัท พรีไซซ ซิสเท็ม แอนด์ โปรเจ็ค จำกัด", est:2533, line:"Smart Grid", pending:true, parent:null},
    {id:"PPP", name:"Precise Power Producer", th:"บริษัท พรีไซซ เพาเวอร์ โปรดิวเซอร์ จำกัด", est:2554, line:"Smart Grid", pending:true, parent:null},
    {id:"PSL", name:"Precise Smart Life", th:"บริษัท พรีไซซ สมาร์ท ไลฟ์ จำกัด", est:2552, line:"Bamboo (BCG)", pending:false, parent:null},
    {id:"PDE", name:"Precise Digital Economy", th:"บริษัท พรีไซซ ดิจิตอล อีโคโนมี่ จำกัด", est:2560, line:"Digital-AI", pending:true, parent:null},
    {id:"SBP", name:"Songkhla Bio Power", th:"บริษัท สงขลาไบโอเพาเวอร์ จำกัด", est:null, line:"Power / Renewable Energy", pending:true, parent:"PPP"},
    {id:"PEMC", name:"PEM Cambodia", th:"พรีไซซ อีเลคตริค (กัมพูชา)", est:2563, line:"Smart Grid", pending:true, parent:"PEM"},
    {id:"PCE", name:"Precise Clean Energy", th:"บริษัท พรีไซซ คลีน เอ็นเนอร์จี้ จำกัด", est:null, line:"Clean Energy", pending:true, parent:"PPP"}
  ];

PRC.FILTER_COMPANIES = [
    {id:"PCC", legal:"บริษัท พรีไซซ คอร์ปอเรชั่น จำกัด (มหาชน)"},
    {id:"PEM", legal:"บริษัท พรีไซซ อีเลคตริค แมนูแฟคเจอริ่ง จำกัด"},
    {id:"PSP", legal:"บริษัท พรีไซซ ซิสเท็ม แอนด์ โปรเจ็ค จำกัด"},
    {id:"PPP", legal:"บริษัท พรีไซซ เพาเวอร์ โปรดิวเซอร์ จำกัด"},
    {id:"PSL", legal:"บริษัท พรีไซซ สมาร์ท ไลฟ์ จำกัด"},
    {id:"PDE", legal:"บริษัท พรีไซซ ดิจิตอล อีโคโนมี่ จำกัด"},
    {id:"SBP", legal:"บริษัท สงขลาไบโอเพาเวอร์ จำกัด"},
    {id:"PCE", legal:"บริษัท พรีไซซ คลีน เอ็นเนอร์จี้ จำกัด"},
    {id:"PEMC", legal:"Precise Electric Manufacturing (Cambodia) Co., Ltd."}
  ];

PRC.PARENT_COMPANIES = ["PEM","PSP","PPP","PSL","PDE"];
