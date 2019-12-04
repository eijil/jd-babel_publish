# 通天塔发布组件（非官方）

将打包后的静态文件(dist.zip)发布到通天塔平台的组件


### 安装

```js
jnpm install @jmfe/jd_babel_publish

```

### 使用
```js
import BablePublish from '@jmfe/jd_babel_publish'

new BabelPublish()

```

### 参数 

```js
 {
     distPath:'dist/dist.zip' //不传则默认根目录dist.zip
 }
```


### 说明

首次执行会在当前目录创建一个配置文件`jbp_config.json` 

根据提示输入

![pic](https://qqadapt.qpic.cn/txdocpic/0/b5d79276a346635395665eff646e23c8/0)

![pic](https://qqadapt.qpic.cn/txdocpic/0/c5da4439b5524a0fae9dd4af4f68e07b/0)


### 注意
jbp_config.json包含铭感信息，如项目需要发布到git记得添加进忽略文件

非官方，所有涉及的接口都是从网上抓下来的，如发布不成请联系lijie8@jd.com