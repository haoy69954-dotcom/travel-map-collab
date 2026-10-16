# 旅伴地图 iPhone 工程

这是现有旅行网站的 iPhone 原型工程，使用 SwiftUI 和 WKWebView 打开同一套账号、地图与行程数据。它提供原生加载与断网重试界面；小红书、大众点评等外部页面在 Safari 视图中打开，高德 App 路线交给 iOS 打开，行程图片下载后调用系统分享菜单。

打开 `TravelMap.xcodeproj`，在 Xcode 的 Signing & Capabilities 中选择自己的 Apple Developer Team，再用 iPhone 模拟器和真机分别检查注册、地图、评论、路线导出、图片保存和从邀请链接进入项目。工程当前的 Bundle ID 是 `com.haoy69954.travelmap`，正式建档前需确认由账号持有人使用。

## 上架前必须完成

1. **换正式域名。** 当前 CloudBase 默认域名会先显示“测试域名”提示页，并有访问频率与稳定性限制。把 `TravelMapScreen.swift` 中的地址改为已绑定且可正常访问的正式 HTTPS 域名。
2. **补足原生体验。** 目前核心页面仍由网站渲染。Apple 的最低功能要求明确指出，仅把网站重新包装为 App 可能无法通过审核。正式候选版应把地图、项目列表、聊天和地点详情中至少主要使用流程做成适合 iPhone 的原生界面，并完整真机测试。
3. **完成内容管理。** 网站已提供账号删除、内容举报和屏蔽用户入口。群聊和评论还需要上线前的内容过滤、举报处理流程和公开联系渠道，并在真机上验证账号删除。
4. **补隐私政策和商店资料。** App 内及 App Store Connect 都需要真实的隐私政策链接，并根据实际收集的邮箱、旅行内容、图片和第三方地图服务填写 App Privacy。准备支持邮箱、截图、描述、年龄分级与审核账号。
5. **构建和签名。** 这台 Mac 目前只有 Command Line Tools，尚未安装完整 Xcode，不能构建或上传 iOS 包。当前（2026 年 10 月）Apple 要求新上传的 App 使用 Xcode 26 或更新版本及对应 SDK。需要 Apple Developer Program 会员资格和账号持有人的签名配置。

相关官方资料：[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)、[App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)、[账号删除要求](https://developer.apple.com/support/offering-account-deletion-in-your-app/)、[上传构建版本](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)。
