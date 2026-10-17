import { webview } from '@kit.ArkWeb';

const TRAVEL_MAP_URL: string = 'https://travel-map-326957-12-1504393798.sh.run.tcloudbase.com/?nativeApp=1';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  @State private loadError: boolean = false;

  build() {
    Stack() {
      Web({ src: TRAVEL_MAP_URL, controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .overScrollMode(OverScrollMode.NEVER)
        .onPageBegin(() => { this.loadError = false; })
        .onErrorReceive((event) => {
          if (event.request.isMainFrame()) this.loadError = true;
        })
        .width('100%')
        .height('100%')
      if (this.loadError) {
        Column({ space: 18 }) {
          Text('网络连接失败')
            .fontSize(20)
            .fontWeight(FontWeight.Bold)
            .fontColor('#234C44')
          Text('请检查网络后重试')
            .fontSize(15)
            .fontColor('#55736B')
          Button('重新打开')
            .backgroundColor('#317B69')
            .fontColor(Color.White)
            .onClick(() => {
              this.loadError = false;
              this.controller.loadUrl(TRAVEL_MAP_URL);
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
