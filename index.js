const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const logger = new NIL.Logger('PlayerInfo');
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
        if(cfg.ranking == undefined){
            cfg.ranking = {
                enable:true,
                limit:15,
                gold:"金币榜",
                dig:"挖掘榜",
                kill:"击杀榜",
                death:"死亡榜",
                place:"放置榜",
                con:"连登榜",
                cum:"累登榜"
            }
            save_data('config.json',cfg)
        }
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
            let list = loadPlayerData(cfg.path)
            if(cfg.ranking.enable && list){
                let tmp_arr,msg
                switch(e.raw_message){
                    case cfg.ranking.gold:
                        tmp_arr = data_sort(list,'money')
                        img_reply(e,cfg,tmp_arr,'MoneyList','金币排行榜')
                        break;
                    case cfg.ranking.kill:
                        tmp_arr = data_sort(list,'kill')
                        img_reply(e,cfg,tmp_arr,'KillList','击杀排行榜')
                        break;
                    case cfg.ranking.death:
                        tmp_arr = data_sort(list,'death')
                        img_reply(e,cfg,tmp_arr,'DeathList','死亡排行榜')
                        break;
                    case cfg.ranking.dig:
                        tmp_arr = data_sort(list,'breakBlock')
                        img_reply(e,cfg,tmp_arr,'DigList','挖掘排行榜')
                        break;
                    case cfg.ranking.place:
                        tmp_arr = data_sort(list,'placeBlock')
                        img_reply(e,cfg,tmp_arr,'PlaceLList','放置排行榜')
                        break;
                    case cfg.ranking.con:
                        tmp_arr = login_sort(lgdata,'con')
                        img_reply(e,cfg,tmp_arr,'Login_Con_List','连续登录榜')
                        break;
                    case cfg.ranking.cum:
                        tmp_arr = login_sort(lgdata,'cum')
                        img_reply(e,cfg,tmp_arr,'Login_Cum_List','累计登录榜')
                        break;
                    default:
                        break;
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

function img_reply(e,cfg,arr,type,title){
    let arr_data = []
    for(var a = 0; a < arr.length && a < cfg.ranking.limit; a++){
		arr_data[a] = arr[a]
	}
    let data = {
        type: type,
        title: title,
        data: arr_data
    }
    uploadDate(data).then(resp =>{
        const data = resp.data;
        if(data.url != undefined){
            e.reply(segment.image(data.url))
        }else{
            let msg = format_msg(arr,title,cfg.ranking.limit)
            e.reply(msg)
        }
    }).catch((err)=>{
        logger.warn('获取图片连接失败，将发送文字排行榜')
        if(cfg.debug){
            console.log(err)
        }
        let msg = format_msg(arr,title,cfg.ranking.limit)
        e.reply(msg)
    })
}

function uploadDate(data){
    let r = axios(
        {
            method: "POST",
            url:`${baseUrl}/ranking`,
            data: data
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

function format_msg(arr,t,limit = 15){
	let arr_data = [];
	arr_data[0] = `${t}\n\n`;
	for(var a = 0; a < arr.length && a < limit; a++){
		let d = a + 1;
		arr_data[d] = `${arr[a].xboxid}\t${arr[a].data}\n`;
	}
	return arr_data
}

function login_sort(tmp_data,p){
	let p_data = JSON.parse(JSON.stringify(tmp_data, null, '\t'));
	let p_arr = [];
	var i = 0;
	for(let m in p_data){
		let tmp = p_data[m];
		p_arr[i] = {xboxid:tmp['xboxid'],data:tmp[p]};
		i++;
	}	
	p_arr.sort(compare('data'));
	p_arr.reverse();
	return p_arr;
}

function data_sort(arr,p){
    let p_arr = [];
    for(let i = 0; i < arr.length; i++){
        let tmp = arr[i]
        p_arr[i] = {xboxid:tmp['name'],data:tmp[p]}
    }
    p_arr.sort(compare('data'));
	p_arr.reverse();
	return p_arr;
}

function compare(prop){
	return function(a,b) {
		var value1 = a[prop];
		var value2 = b[prop];
		return value1-value2
	}
}

module.exports = new logindata;