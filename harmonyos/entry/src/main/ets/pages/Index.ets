import { webview } from '@kit.ArkWeb';

const TRAVEL_MAP_URL: string = 'https://travel-map-326957-12-1504393798.sh.run.tcloudbase.com/';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  @State private webOpen: boolean = false;
  @State private loading: boolean = false;
  @State private loadError: boolean = false;

  build() {
    Column() {
      if (this.webOpen) {
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
