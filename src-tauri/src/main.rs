// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod document;
use document::{Document,Payload};
use std::sync::{Arc,Mutex};
use tauri::{State,WebviewWindow};

struct Session { current:Document, candidate:Option<Document>, startup:bool }
#[derive(Clone)] struct Store { session:Arc<Mutex<Session>>, operation:Arc<Mutex<()>> }
fn origin(window:&WebviewWindow)->Result<(),String>{
    let url=window.url().map_err(|e|e.to_string())?;
    let local= url.scheme()=="tauri" || (url.scheme()=="http" && url.host_str()==Some("tauri.localhost")) || (cfg!(debug_assertions) && url.host_str()==Some("127.0.0.1") && url.port()==Some(1420));
    if window.label()!="main" || !local {return Err("拒绝非本地窗口请求".into())} Ok(())
}
fn check(s:&Session,id:&str)->Result<(),String>{if s.current.payload.doc_id!=id {Err("文档会话已过期".into())}else{Ok(())}}
async fn blocking<T:Send+'static>(f:impl FnOnce()->Result<T,String>+Send+'static)->Result<T,String>{tauri::async_runtime::spawn_blocking(f).await.map_err(|e|e.to_string())?}
#[tauri::command]
async fn startup_document(window:WebviewWindow,state:State<'_,Store>)->Result<Payload,String>{
 origin(&window)?;let store=state.inner().clone();blocking(move||{let _op=store.operation.try_lock().map_err(|_|"文件操作正在进行")?;
 let mut s=store.session.lock().map_err(|e|e.to_string())?;
 if s.startup{return Ok(s.current.payload.clone())} s.startup=true;drop(s);
 let doc=if let Some(path)=std::env::args_os().nth(1){document::read(path.into())?}else{document::blank()};
 let mut s=store.session.lock().map_err(|e|e.to_string())?;s.current=doc;Ok(s.current.payload.clone())}).await
}
#[tauri::command]
async fn prepare_open(window:WebviewWindow,state:State<'_,Store>,doc_id:String)->Result<Option<Payload>,String>{
 origin(&window)?;let store=state.inner().clone();blocking(move||{let _op=store.operation.try_lock().map_err(|_|"文件操作正在进行")?;
 {let guard=store.session.lock().map_err(|e|e.to_string())?;check(&guard,&doc_id)?;}
 let Some(path)=rfd::FileDialog::new().add_filter("Markdown",&["md","markdown","txt"]).pick_file() else{return Ok(None)};
 // Only commit_document/startup_document replace current, and both need the operation lock held here.
 let doc=document::read(path)?;let mut s=store.session.lock().map_err(|e|e.to_string())?;
 let payload=doc.payload.clone();s.candidate=Some(doc);Ok(Some(payload))}).await
}
#[tauri::command]
fn prepare_new(window:WebviewWindow,state:State<'_,Store>,doc_id:String)->Result<Payload,String>{origin(&window)?;let mut s=state.session.lock().map_err(|e|e.to_string())?;check(&s,&doc_id)?;let doc=document::blank();let payload=doc.payload.clone();s.candidate=Some(doc);Ok(payload)}
#[tauri::command]
fn commit_document(window:WebviewWindow,state:State<'_,Store>,doc_id:String,candidate_id:String)->Result<(),String>{origin(&window)?;let _op=state.operation.try_lock().map_err(|_|"文件操作正在进行")?;let mut s=state.session.lock().map_err(|e|e.to_string())?;check(&s,&doc_id)?;if s.candidate.as_ref().map(|d|d.payload.doc_id.as_str())!=Some(candidate_id.as_str()){return Err("候选文档已过期".into())}s.current=s.candidate.take().unwrap();Ok(())}
#[derive(serde::Serialize)] #[serde(rename_all="camelCase")] struct Saved {doc_id:String,revision:u64,name:String}
#[tauri::command]
async fn save_document(window:WebviewWindow,state:State<'_,Store>,doc_id:String,revision:u64,text:String,save_as:bool,normalize_mixed:bool)->Result<Option<Saved>,String>{
 origin(&window)?;let store=state.inner().clone();blocking(move||{let _op=store.operation.try_lock().map_err(|_|"文件操作正在进行")?;
 let doc={let s=store.session.lock().map_err(|e|e.to_string())?;check(&s,&doc_id)?;s.current.clone()};
 if doc.disk.as_ref().is_some_and(|d|d.mixed)&&!normalize_mixed{return Err("混合换行需要明确确认后写入".into())}
 let old=doc.disk.as_ref();let (path,expected)=if save_as||old.is_none(){
 let Some(p)=rfd::FileDialog::new().add_filter("Markdown",&["md"]).set_file_name(&doc.payload.name).save_file()else{return Ok(None)};
 let expected=if p.exists(){
 let hash=document::fingerprint(&document::bytes(&p)?);
 let yes=rfd::MessageDialog::new().set_title("确认覆盖").set_description("替换所选文件？").set_buttons(rfd::MessageButtons::YesNo).show();
 if yes!=rfd::MessageDialogResult::Yes{return Ok(None)} Some(hash)
 }else{None};(p,expected)
 }else{let d=old.unwrap();(d.path.clone(),Some(d.hash.clone()))};
 let bom=old.is_some_and(|d|d.bom);let eol=old.map(|d|d.eol.as_str()).unwrap_or("lf");let data=document::encode(&text,bom,eol)?;
 let hash=document::write(&path,&data,expected.as_deref())?;
 let mut s=store.session.lock().map_err(|e|e.to_string())?;
 let name=path.file_name().unwrap_or_default().to_string_lossy().into_owned();
 s.current.disk=Some(document::Disk{path,hash,bom,eol:eol.into(),mixed:false});s.current.payload.name=name.clone();s.current.payload.mixed=false;
 Ok(Some(Saved{doc_id,revision,name}))}).await
}
fn main(){
 let store=Store{session:Arc::new(Mutex::new(Session{current:document::blank(),candidate:None,startup:false})),operation:Arc::new(Mutex::new(()))};
 tauri::Builder::default().manage(store).setup(|app|{
 tauri::WebviewWindowBuilder::new(app,"main",tauri::WebviewUrl::App("index.html".into())).title("Quick MD").inner_size(1050.,780.).min_inner_size(580.,400.)
 .on_navigation(|url|url.scheme()=="tauri"||(url.scheme()=="http"&&url.host_str()==Some("tauri.localhost"))||(cfg!(debug_assertions)&&url.host_str()==Some("127.0.0.1")&&url.port()==Some(1420)))
 .on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny).build()?;Ok(())
 }).invoke_handler(tauri::generate_handler![startup_document,prepare_open,prepare_new,commit_document,save_document]).run(tauri::generate_context!()).expect("启动 Quick MD");
}
