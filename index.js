#! /usr/bin/env node


const path = require('path');
const fs = require('fs');
const request = require('request');
const inquirer = require('inquirer')

const chalk = require('chalk');
const ora = require('ora');
const spinner = ora();

const cwd = process.cwd();  //当前程序执行目录
const config_file_name = 'jbp_config.json';
const configPath = path.join(cwd, config_file_name); //配置文件路径
const distPath = path.join(cwd, 'dist.zip'); //上传代码路径

const uploadUri = 'http://babel.jd.com/service/upload';
const deployUri = 'http://babel.jd.com/service/releasePageDev';
const loginUri = 'http://ssa.jd.com/sso/login';
const previewUri = 'http://babel.jd.com/service/previewPageDev'
const queryUri = 'http://babel.jd.com/service/babelQueryActivity'



class BabelPublish {
    constructor() {
        this.ticket = ''
        this.config = {
            erp: '',
            pwd: '',
            url: '',
            name: '',
            activityId: '',
            pageId: '',
        }
        this.fromData = {}
        this.start()
    }

    async start() {
        //初始化配置信息
        this.initConfigInfo();
        await this.upload();
    }

    async initConfigInfo() {
        // if (!fs.existsSync(distPath)){
        //     console.log(chalk.yellow('没有发现dist.zip文件,发布停止'))
        //     return;
        // }
        const exists = fs.existsSync(configPath);
        if (!exists) {
            await this.setUserInfo();
            await this.setActivityInfo();
        } else {
            //检查登录是否成功
            let content = fs.readFileSync(configPath, 'utf8');
            try {
                this.config = JSON.parse(content);
            }
            catch{
                console.log('jbp_config.json文件错误，删除后重试！')
                return;
            }
            let isLogin = await this.login();
            if (!isLogin) {
                await this.setUserInfo();
            }
            if (!this.config.name) {
                await this.setActivityInfo();
            }
        }
        // this.initUserInfo();

    }
    setUserInfo() {
        const prompts = [{
            type: 'input',
            message: 'Enter erp:',
            name: 'username',
        },
        {
            type: 'password:',
            message: 'Enterpassword',
            name: 'password',
        }
        ];
        return new Promise(resolve => {
            inquirer.prompt(prompts).then(async answers => {

                Object.assign(this.config, {
                    erp: answers.username,
                    pwd: answers.password
                })
                await this.login().then(login => {
                    if (!login) {
                        this.setUserInfo();
                    } else {
                        resolve()
                    }
                })
            })
        })
    }
    async setActivityInfo() {
        await this.getActivityList().then(list => {
            let choices = [];
            list.forEach((item, index) => {
                let option = { name: `${item.name}-${chalk.gray(item.mender)}`, value: index }
                choices.push(option);
            });
            inquirer.prompt([
                {
                    type: 'list',
                    message: '选择一个你要上传的活动，只拉取最新的10条',
                    name: 'act',
                    choices: choices,

                }
            ]).then(answ => {
                let choice = list[answ['act']];
                Object.assign(this.config, {
                    url: choice.pagePreUrlWX,
                    name: choice.name,
                    activityId: choice.id,
                    pageId: choice.pages.length >= 1 ? choice.pages[0].id : 0,
                })
                //写入配置文件
                fs.writeFileSync(config_file_name, JSON.stringify(this.config), 'utf8', (err) => {
                    if (err) throw err;
                })
            })
        })

    }
    /**
    * 内网登录
    * @param erp名
    * @param erp密码
    * @returns Promise
    */
    login() {

        return new Promise((resolve, reject) => {
            request.post(loginUri, {
                form: {
                    'username': this.config.erp,
                    'password': this.config.pwd
                }
            }, (err, res, body) => {
                if (!err) {
                    let cookie = res.headers["set-cookie"];

                    if (cookie) {
                        this.ticket = cookie[1];
                        fs.writeFileSync(config_file_name, JSON.stringify(this.config), 'utf8', (err) => {
                            if (err) throw err;
                        })
                        resolve(true);
                    } else {
                        spinner.fail('账号名或密码错误,请重新输入：');
                        resolve(false);
                    }
                } else {
                    reject('login fail');
                }

            })
        })
    }
    /**
     * 上传zip到通天塔
     * @return Promise 
     */
    upload() {
        
        Object.assign(this.fromData,{
            activityId: this.config.activityId,
            pageId: this.config.pageId
        })
        console.log('发布项目信息：'+ this.config.name)
        return ;

        spinner.start('upload..');
        return new Promise((resolve, reject) => {
            request.post(uploadUri, {
                headers: {
                    cookie: this.ticket
                },
                formData: {
                    body: JSON.stringify(this.formdata),
                    file: fs.createReadStream(distPath),
                }
            }, (err, res, body) => {
                if (err) {
                    reject(err);
                } else {
                    let result = JSON.parse(body);
                    const {
                        code,
                        subCode,
                        returnMsg,
                        content,
                    } = result;
                    if (code == 0 && subCode == 0) {
                        formdata.content = content;
                        spinner.succeed('upload success')
                        resolve();

                    } else {
                        spinner.fail('upload fail')
                        console.log(chalk.yellow(returnMsg));

                    }

                }

            });
        })
    }
    /** 
     * 查询你的活动列表
     */
    getActivityList() {
        const params = {
            "beginDate": "2000-01-01",
            "endDate": "2099-12-31",
            "interval": "2",
            "searchStr": "",
            "status": "0",
            "item": "3",
            "pageSize": "10",
            "currentPage": "1",
            "extnet": "1"
        }
        spinner.start('正在拉取您的活动列表...')
        return new Promise((resolve, reject) => {
            request.post(queryUri, {
                headers: {
                    cookie: this.ticket,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                },
                formData: {
                    body: JSON.stringify(params)
                }
            }, (err, res, body) => {

                if (err) { throw err }
                const { code, subCode, list } = JSON.parse(body)
                if (code == 0 && subCode == 0) {
                    spinner.stop()

                    resolve(list)
                } else {
                    reject('error')
                }
            })
        })
    }

    readConfigFile() {

    }


}

new BabelPublish()