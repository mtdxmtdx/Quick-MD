// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 mtdxmtdx and contributors.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs::{self, File}, io::{Read, Write}, path::{Path, PathBuf}};
use tempfile::NamedTempFile;

pub const LIMIT: usize = 20 * 1024 * 1024;
#[derive(Clone, Debug)]
pub struct Disk { pub path: PathBuf, pub hash: String, pub bom: bool, pub eol: String, pub mixed: bool }
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all="camelCase")]
pub struct Payload { pub doc_id: String, pub text: String, pub name: String, pub mixed: bool, pub eol: String }
#[derive(Clone)]
pub struct Document { pub payload: Payload, pub disk: Option<Disk> }
pub fn fingerprint(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
pub fn bytes(path: &Path) -> Result<Vec<u8>, String> {
    let mut f = File::open(path).map_err(|e| format!("读取失败：{e}"))?;
    let m = f.metadata().map_err(|e| e.to_string())?;
    if !m.is_file() || m.len() > LIMIT as u64 { return Err("仅接受不超过 20 MiB 的普通文件".into()); }
    let mut data = Vec::new();
    (&mut f).take((LIMIT + 1) as u64).read_to_end(&mut data).map_err(|e| e.to_string())?;
    if data.len() > LIMIT { return Err("文件超过 20 MiB".into()); }
    Ok(data)
}
pub fn decode(data: &[u8]) -> Result<(String, bool, String, bool), String> {
    let bom = data.starts_with(&[239,187,191]);
    let s = std::str::from_utf8(if bom { &data[3..] } else { data }).map_err(|_| "文件不是有效 UTF-8；原文未改变")?;
    let crlf = s.matches("\r\n").count();
    let rest = s.replace("\r\n", "");
    let cr = rest.matches('\r').count(); let lf = rest.matches('\n').count();
    let mixed = [crlf,cr,lf].iter().filter(|&&n| n>0).count()>1;
    let eol = if crlf>0 {"crlf"} else if cr>0 {"cr"} else {"lf"};
    Ok((s.replace("\r\n","\n").replace('\r',"\n"),bom,eol.into(),mixed))
}
pub fn blank() -> Document {
    Document { payload:Payload {doc_id:uuid::Uuid::new_v4().to_string(),text:String::new(),name:"未命名".into(),mixed:false,eol:"lf".into()},disk:None }
}
pub fn read(path: PathBuf) -> Result<Document,String> {
    let ext=path.extension().and_then(|s|s.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["md","markdown","txt"].contains(&ext.as_str()) { return Err("请选择 .md、.markdown 或 .txt 文件".into()); }
    let data=bytes(&path)?; let (text,bom,eol,mixed)=decode(&data)?;
    Ok(Document {payload:Payload{doc_id:uuid::Uuid::new_v4().to_string(),text,name:path.file_name().unwrap_or_default().to_string_lossy().into_owned(),mixed,eol:eol.clone()},disk:Some(Disk {path,hash:fingerprint(&data),bom,eol,mixed})})
}
pub fn encode(text:&str,bom:bool,eol:&str)->Result<Vec<u8>,String> {
    if text.len()>LIMIT {return Err("保存内容超过 20 MiB".into())}
    let s=match eol {"crlf"=>text.replace('\n',"\r\n"),"cr"=>text.replace('\n',"\r"),_=>text.into()};
    let mut out=if bom {vec![239,187,191]} else {vec![]}; out.extend_from_slice(s.as_bytes());
    if out.len()>LIMIT {return Err("编码后的文件超过 20 MiB".into())} Ok(out)
}
// Fingerprint check is not a cross-process compare-and-swap. No ACL/readonly changes.
pub fn write(path:&Path,data:&[u8],expected:Option<&str>)->Result<String,String> {
    write_staged(path,data,expected,|_|Ok(()))
}
fn write_staged(path:&Path,data:&[u8],expected:Option<&str>,hook:impl Fn(&str)->Result<(),String>)->Result<String,String> {
    if let Some(hash)=expected {
        if fingerprint(&bytes(path)?)!=hash {return Err("磁盘文件已被外部修改；请另存为或重新打开".into())}
        if fs::metadata(path).map_err(|e|e.to_string())?.permissions().readonly() {return Err("目标为只读文件；请另存为".into())}
    } else if path.exists() { return Err("目标已由其他进程创建；请重新选择".into()); }
    let parent=path.parent().ok_or("目标没有父目录")?;
    let mut temp=NamedTempFile::new_in(parent).map_err(|e|format!("创建临时文件失败：{e}"))?;
    hook("created")?;
    temp.write_all(data).map_err(|e|format!("写入临时文件失败：{e}"))?;
    hook("written")?;
    temp.as_file().sync_all().map_err(|e|format!("同步临时文件失败：{e}"))?;
    hook("synced")?;
    // Recheck immediately before replacement; new targets use no-clobber persist.
    if let Some(hash)=expected {
        if fingerprint(&bytes(path)?)!=hash {return Err("保存期间目标已变化；未执行替换".into())}
        temp.persist(path).map_err(|e|format!("替换失败，请检查目标后另存为：{}",e.error))?;
    } else {temp.persist_noclobber(path).map_err(|e|format!("目标已存在或创建失败：{}",e.error))?;}
    Ok(fingerprint(data))
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn encoding_roundtrips(){for s in ["你好😀\r\nend","x\ry\r","x\ny\n",""] {for bom in [false,true] {let mut b=if bom{vec![239,187,191]}else{vec![]};b.extend_from_slice(s.as_bytes());let(t,bom,eol,m)=decode(&b).unwrap();assert!(!m);assert_eq!(encode(&t,bom,&eol).unwrap(),b);}}}
    #[test] fn invalid_and_mixed(){assert!(decode(&[255]).is_err());assert!(decode(b"a\r\nb\nc\rd").unwrap().3);}
    #[test] fn conflict_and_new_target(){let dir=tempfile::tempdir().unwrap();let p=dir.path().join("中文 😀.md");let h=write(&p,b"old",None).unwrap();assert!(write(&p,b"bad",None).is_err());fs::write(&p,b"external").unwrap();assert!(write(&p,b"new",Some(&h)).is_err());assert_eq!(fs::read(&p).unwrap(),b"external");}
    #[test] fn replace_complete(){let dir=tempfile::tempdir().unwrap();let p=dir.path().join("a.md");let h=write(&p,b"old",None).unwrap();write(&p,b"new",Some(&h)).unwrap();assert_eq!(fs::read(&p).unwrap(),b"new");}
    #[test] fn read_limits(){let dir=tempfile::tempdir().unwrap();let p=dir.path().join("a.md");File::create(&p).unwrap().set_len((LIMIT+1) as u64).unwrap();assert!(read(p).is_err());assert!(bytes(dir.path()).is_err());}
    #[test] fn failure_at_each_write_stage_preserves_original(){for stage in ["created","written","synced"]{let dir=tempfile::tempdir().unwrap();let p=dir.path().join("a.md");let h=write(&p,b"original",None).unwrap();assert!(write_staged(&p,b"modified",Some(&h),|s|if s==stage{Err("injected failure".into())}else{Ok(())}).is_err());assert_eq!(fs::read(&p).unwrap(),b"original");assert_eq!(fs::read_dir(dir.path()).unwrap().count(),1);}}
    #[test] fn new_target_race_does_not_clobber(){let dir=tempfile::tempdir().unwrap();let p=dir.path().join("a.md");assert!(write_staged(&p,b"modified",None,|s|{if s=="synced"{fs::write(&p,b"external").unwrap()}Ok(())}).is_err());assert_eq!(fs::read(&p).unwrap(),b"external");}
    #[test] fn readonly_is_not_cleared(){let dir=tempfile::tempdir().unwrap();let p=dir.path().join("a.md");let h=write(&p,b"original",None).unwrap();let original=fs::metadata(&p).unwrap().permissions();let mut ro=original.clone();ro.set_readonly(true);fs::set_permissions(&p,ro).unwrap();assert!(write(&p,b"modified",Some(&h)).is_err());assert!(fs::metadata(&p).unwrap().permissions().readonly());assert_eq!(fs::read(&p).unwrap(),b"original");fs::set_permissions(&p,original).unwrap();}
    #[cfg(windows)] #[test] fn exclusive_windows_lock_preserves_original(){use std::os::windows::fs::OpenOptionsExt;let dir=tempfile::tempdir().unwrap();let p=dir.path().join("a.md");let h=write(&p,b"original",None).unwrap();let held=fs::OpenOptions::new().read(true).share_mode(0).open(&p).unwrap();assert!(write(&p,b"modified",Some(&h)).is_err());drop(held);assert_eq!(fs::read(&p).unwrap(),b"original");}
    #[test] fn encoded_size_limit(){assert!(encode(&"\n".repeat(LIMIT/2+1),false,"crlf").is_err());}
}
