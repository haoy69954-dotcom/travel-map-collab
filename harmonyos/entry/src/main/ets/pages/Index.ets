import { webview } from '@kit.ArkWeb';

const TRAVEL_MAP_URL: string = 'https://travel-map-326957-12-1504393798.sh.run.tcloudbase.com/?nativeConsent=1';
const PRIVACY_VERSION: number = 20261016;
const PRIVACY_TEXT: string =
  '更新日期：2026 年 10 月 16 日\n\n' +
  '运营者：万紫衣。隐私和内容举报联系邮箱：haoy69954@gmail.com。\n\n' +
  '旅伴地图用于多人收藏地点、讨论和规划行程。注册时，我们处理您填写的昵称、邮箱和密码；密码加盐哈希保存。登录后使用有效期为 30 天的必要会话 Cookie。\n\n' +
  '您创建或加入的旅行项目、日期、地点与坐标、理由、评论、群聊消息、投票、行程、图片和外部链接会保存在腾讯云 CloudBase，并向同一旅行的伙伴展示。持有邀请链接的人可以预览旅行内容，请谨慎分享链接。在线状态、举报及屏蔽设置用于协作和内容管理。面板宽度、群聊已读状态保存在本机浏览器。\n\n' +
  '高德地图由北京高德图强科技有限公司提供地图、地点搜索和路线规划，可能处理网络信息及您搜索或选择的地点；其隐私政策见 https://lbs.amap.com/home/privacy/。高德不可用时，网站可能使用 OpenStreetMap 地图瓦片。网页目前还会在同意后从 Google Fonts 和 unpkg 加载字体与地图组件，这些服务可能收到网络请求信息。\n\n' +
  '您主动粘贴小红书或大众点评链接时，服务端可能访问公开页面读取标题和封面；点击原帖会打开对应平台。当前应用不读取手机 GPS 精确定位，也不申请相机或通讯录权限；只有在您主动上传照片时才处理选中的图片。\n\n' +
  '您可在账号设置中验证密码后删除账号和自己发布的内容；其他旅伴创建的旅行保留。您也可通过联系邮箱请求查阅、更正、复制或删除个人信息、撤回同意。不同意本政策可以暂不使用联网服务。\n\n' +
  '完整政策在同意后可于应用内查看，也可在浏览器打开网站 /privacy.html。政策发生重大变化时，我们会提示您重新阅读。';

PersistentStorage.persistProp<number>('travelPrivacyVersion', 0);

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  @State private webOpen: boolean = false;
  @State private loading: boolean = false;
  @State private loadError: boolean = false;
  @State private privacyOpen: boolean = false;
  @StorageLink('travelPrivacyVersion') private privacyVersion: number = 0;

  build() {
    Column() {
      if (this.privacyOpen) {
        Row() {
          Button('← 返回')
            .backgroundColor('#EDF4EE')
            .fontColor('#234C44')
            .onClick(() => { this.privacyOpen = false; })
          Text('隐私政策')
            .fontSize(20)
            .fontWeight(FontWeight.Bold)
            .fontColor('#234C44')
            .margin({ left: 14 })
        }
        .width('100%')
        .padding(20)
        Scroll() {
          Text(PRIVACY_TEXT)
            .fontSize(15)
            .lineHeight(25)
            .fontColor('#405D55')
            .padding({ left: 22, right: 22, bottom: 32 })
        }
        .layoutWeight(1)
      } else if (this.privacyVersion < PRIVACY_VERSION) {
        Column({ space: 18 }) {
          Text('🧳')
            .fontSize(62)
          Text('欢迎来到旅伴地图')
            .fontSize(29)
            .fontWeight(FontWeight.Bold)
            .fontColor('#234C44')
          Text('我们会保存您与旅伴分享的地点、评论和行程；高德提供地图，腾讯云托管服务。使用前请先了解信息如何处理。')
            .fontSize(16)
            .lineHeight(25)
            .textAlign(TextAlign.Center)
            .fontColor('#55736B')
            .margin({ left: 22, right: 22 })
          Button('查看完整隐私政策')
            .backgroundColor('#EDF4EE')
            .fontColor('#234C44')
            .onClick(() => { this.privacyOpen = true; })
          Button('同意并进入')
            .fontSize(18)
            .fontWeight(FontWeight.Bold)
            .backgroundColor('#317B69')
            .fontColor(Color.White)
            .borderRadius(16)
            .height(56)
            .width('86%')
            .onClick(() => { this.privacyVersion = PRIVACY_VERSION; })
          Text('暂不同意时可直接关闭应用；联网功能不会启动。')
            .fontSize(13)
            .fontColor('#71877E')
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#FFF9E2')
      } else if (this.webOpen) {
        Row() {
          Button('←')
            .fontSize(20)
            .backgroundColor('#EDF4EE')
            .fontColor('#234C44')
            .onClick(() => { this.webOpen = false; })
          Text('🧳 旅伴地图')
            .fontSize(18)
            .fontWeight(FontWeight.Bold)
            .fontColor('#234C44')
            .margin({ left: 12 })
          Blank()
          Button('刷新')
            .backgroundColor('#EDF4EE')
            .fontColor('#234C44')
            .onClick(() => {
              this.loadError = false;
              this.controller.loadUrl(TRAVEL_MAP_URL);
            })
        }
        .width('100%')
        .height(56)
        .padding({ left: 16, right: 16 })
        .backgroundColor('#FFF9E2')

        if (this.loading) {
          Text('正在打开旅行地图…')
            .fontSize(14)
            .fontColor('#55736B')
            .padding(8)
        }
        if (this.loadError) {
          Text('网络连接失败，请检查网络后点击刷新')
            .fontSize(14)
            .fontColor('#AB5147')
            .padding(8)
        }
        Web({ src: TRAVEL_MAP_URL, controller: this.controller })
          .javaScriptAccess(true)
          .domStorageAccess(true)
          .onPageBegin(() => { this.loading = true; this.loadError = false; })
          .onPageEnd(() => { this.loading = false; })
          .onErrorReceive(() => { this.loading = false; this.loadError = true; })
          .width('100%')
          .layoutWeight(1)
      } else {
        Column({ space: 20 }) {
          Text('🧳')
            .fontSize(72)
          Text('旅伴地图')
            .fontSize(34)
            .fontWeight(FontWeight.Bold)
            .fontColor('#234C44')
          Text('把想去的地方放上地图，\n和旅伴一路聊出来。')
            .fontSize(18)
            .textAlign(TextAlign.Center)
            .fontColor('#55736B')
          Row({ space: 12 }) {
            Text('🍜 吃什么').fontSize(15).fontColor('#234C44')
            Text('🎡 去哪里').fontSize(15).fontColor('#234C44')
            Text('🛏️ 住哪儿').fontSize(15).fontColor('#234C44')
          }
          .margin({ top: 10, bottom: 10 })
          Button('进入旅行地图 →')
            .fontSize(18)
            .fontWeight(FontWeight.Bold)
            .backgroundColor('#317B69')
            .fontColor(Color.White)
            .borderRadius(16)
            .height(56)
            .width('86%')
            .onClick(() => {
              this.loading = true;
              this.webOpen = true;
            })
          Button('隐私政策')
            .backgroundColor('#EDF4EE')
            .fontColor('#234C44')
            .onClick(() => { this.privacyOpen = true; })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#FFF9E2')
      }
    }
    .width('100%')
    .height('100%')
  }
}
