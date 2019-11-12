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
        this.formData = {}
        this.start()
    }

    async start() {
        //初始化配置信息
        await this.initConfigInfo();
        await this.upload();
        await this.preview();
        await this.deploy();
    }

    async initConfigInfo() {
        if (!fs.existsSync(distPath)) {
            console.log(chalk.yellow('没有发现dist.zip文件,发布停止'))
            return;
        }
        const exists = fs.existsSync(configPath);
        if (!exists) {
            await this.setUserInfo();
            await this.setActivityInfo();
        } else {
            let content = fs.readFileSync(configPath, 'utf8');
            try {
                this.config = JSON.parse(content);
            }
            catch{
                console.log('jbp_config.json文件错误，删除后重试！')
                return;
            }
            //检查登录是否成功
            let isLogin = await this.login();
            if (!isLogin) {
                await this.setUserInfo();
            }
        }
    }
    async setUserInfo() {
        const prompts = [{
            type: 'input',
            message: 'Enter erp:',
            name: 'username',
        },
        {
            type: 'pwd',
            message: 'Enter password',
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
        const list = await this.getActivityList();
        let choices = [];
        list.forEach((item, index) => {
            let option = { name: `${item.name}-${chalk.gray(item.mender)}`, value: index }
            choices.push(option);
        });
        return new Promise(resolve => {
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
                resolve();
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
    async confirm() {
        const prompts = [{
            type: 'confirm',
            message: `是否确认发布？ ${chalk.green(this.config.name)}`,
            name: 'confirm',
            suffix: chalk.gray(' 选择n重新选择活动')
        }];
        return new Promise(resolve => {
            inquirer.prompt(prompts).then(async (answers) => {
                if (answers.confirm) {
                    resolve(true)
                } else {
                    await this.setActivityInfo()
                    resolve(false);
                }
            })
        })
    }
    /**
     * 上传zip到通天塔
     * @return Promise 
     */
    async upload() {

        const next = await this.confirm()
        if (!next) {
            await this.upload();
            return;
        }

        Object.assign(this.formData, {
            activityId: this.config.activityId,
            pageId: this.config.pageId
        })

        spinner.start('upload..');
        return new Promise((resolve, reject) => {
            request.post(uploadUri, {
                headers: {
                    cookie: this.ticket
                },
                formData: {
                    body: JSON.stringify(this.formData),
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
                        this.formData.content = content;
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
    async preview() {
        spinner.start('preview..')
        Object.assign(this.formData, {
            changeFlag: 0,
            deletedFileIdList: []
        })
        return new Promise((resolve, reject) => {
            request.post(previewUri, {
                headers: {
                    cookie: this.ticket,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                },
                form: {
                    body: JSON.stringify(this.formData)
                }
            }, (err, res, body) => {
                if (err) {
                    reject('login fail');
                }
                const {
                    code,
                    subCode,
                } = JSON.parse(body);
                if (code == 0 && subCode == 0) {
                    spinner.succeed('preview success!');
                    resolve()
                } else {
                    spinner.fail('preview fail')
                }
            })
        })
    }
    /**
     * 发布
     */
    async deploy() {

        spinner.start('deploy..')
        request.post(deployUri, {
            headers: {
                cookie: this.ticket,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            form: {
                body: JSON.stringify(this.formData)
            }
        }, (err, res, body) => {

            if (err) {
                console.log(err)
            }

            const {
                code,
                subCode,
                returnMsg
            } = JSON.parse(body);
            if (code == 0 && subCode == 0) {
                spinner.succeed('deploy success!');
                console.log('\n   ' + chalk.underline.green(this.config.url))
                process.exit();
            } else {

                console.log(chalk.yellow(`发布失败，正在重新发布...`))
                setTimeout(() => {
                    this.deploy()
                }, 1000);
            }
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
}


module.exports = BabelPublish