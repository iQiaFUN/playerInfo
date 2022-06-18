const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const baseUrl = 'https://fc.iqia.fun';
const { segment } = require('oicq');

function checkFile(file, text) {
    if (NIL.IO.exists(path.join(__dirname, file)) == false) {
        NIL.IO.WriteTo(path.join(__dirname, file), text);
    }
}

function save_data(filesname,data) {
    NIL.IO.WriteTo(path.join(__dirname, filesname), JSON.stringify(data, null, '\t'));
}

function lgdata_exists(id, data){
    for(let m in data){
        if(data[m].xboxid == id)return true;
    }
    return false;
}

checkFile('LoginData.json',"{}");
let lgdata = JSON.parse(NIL.IO.readFrom(path.join(__dirname, 'LoginData.json')));
let loginJob = cron.schedule('0 0 0 * * * ', () => {
    for(let m in lgdata){
        let tmp = lgdata[m];
        if(tmp.login){
            tmp.con = tmp.con + 1;
        }else{
            tmp.con = 0;
        }
        tmp.login = false;
    }
    save_data('LoginData.json',lgdata);
    api.logger.info('logindata数据更新成功')
},{
	scheduled: false
});
class logindata extends NIL.ModuleBase{
    onStart(api){  
        api.logger.info('加载成功');
        loginJob.start()
        checkFile('config.json',NIL.IO.readFrom(path.join(__dirname, 'example.json')))
        const cfg = JSON.parse(NIL.IO.readFrom(path.join(__dirname, 'config.json')))
        api.listen('onPlayerJoin',(dt)=>{
            let data = JSON.parse(dt.message);
            let xboxid = data.params.sender;
            let qq = NIL._vanilla.get_qq(xboxid)
            if(lgdata[qq] == undefined){
                lgdata[qq] = {
                    xboxid:xboxid,
                    time: new Date().getTime(),
                    con:0,
                    cum:1,
                    login:true
                }
				save_data('LoginData.json',lgdata);
            }else{
                if(lgdata[qq].login == false){
                    lgdata[qq].login = true;
                    lgdata[qq].cum++;
                    lgdata[qq].time = new Date().getTime();
                }
				save_data('LoginData.json',lgdata);
            }  
        });

        api.listen('onMainMessageReceived',(e)=>{
            if(e.raw_message==cfg.cmd){
                if(NIL._vanilla.wl_exists(e.sender.qq)){
					let qq = e.sender.qq;
                    let xboxid = NIL._vanilla.get_xboxid(qq);
                    let pl = NIL._vanilla.get_player(xboxid);
                    let pldata = getPlayerRecord(cfg.path,xboxid);
                    let data = {}
                    if(lgdata_exists(xboxid, lgdata)){
                        let cum = lgdata[qq].cum;
						let con = lgdata[qq].con;
                        let str = []
                        if(pldata != false){
                            data = JSON.parse(JSON.stringify(pldata))
                            data.cum_login = cum;
                            data.con_login = con;
                            data.play_time = pl.period;
                            data.xboxid = pl.xboxid;
                            let dt = {
                                qq:qq,
                                data:data
                            }
                            str = [
                                `玩家名：${xboxid}\n`,
                                `累计登陆: ${data.cum_login}天\n`,
                                `连续登陆：${data.con_login}天\n`,
                                `游玩时间：${timeFormat(data.play_time)}小时\n`,
                                `击杀实体：${data.kill}个\n`,
                                `死亡次数：${data.death}次\n`,
                                `金币数量：${data.money}\n`,
                                `方块挖掘数量：${data.breakBlock}个\n`,
                                `方块放置数量：${data.placeBlock}个`
                            ];
                            if(cfg.img){
                                postDate(dt).then(resp =>{
                                    const data = resp.data;
                                    if(data.url != undefined){
                                        e.reply(segment.image(data.url))
                                    }else{
                                        e.reply(str);
                                    }
                                }).catch((err)=>{
                                    api.logger.warn('获取图片链接失败，将发送文字版')
                                    if(cfg.debug){
                                        console.log(err)
                                    }
                                    e.reply(str);
                                })
                            }else{
                                e.reply(str)
                            } 
                        }else{
                            e.reply(`record数据未更新，请进入服务器后重试`);
                        }
                    }else{
                        e.reply(`登录数据未更新，请进入服务器后重试`);
                    }
                }else{
                    e.reply('你还没有绑定白名单，无法查看统计数据');
                }
            }
        })
    }
    onStop(){
		save_data('LoginData.json',lgdata);
        loginJob.stop()
	}
}

function postDate(dt){
    let r = axios(
        {
            method: "POST",
            url:`${baseUrl}/card`,
            data: dt
        }
    )
    return r
}

function loadPlayerData(address){
    let data=fs.readFileSync(address,"utf8");
    if (data){
        return JSON.parse(data);
    }
    return false;
}

function timeFormat(dur){
    if (dur!==0){
        let hour=3600*1000;
        return (dur/hour).toFixed(2);
    }
    return 0;
}

function getPlayerRecord(address,name) {
    let list=loadPlayerData(address);
    if (list){
        for(let i=0;i<list.length;i++){
            if (list[i].name===name){
                return list[i];
            }
        }
    }
    return false;
}

module.exports = new logindata;