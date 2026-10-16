import SafariServices
import SwiftUI
import WebKit

private enum TravelMapSite {
    static let home = URL(string: "https://travel-map-326957-12-1504393798.sh.run.tcloudbase.com/")!
    static let host = home.host!
}

struct ExternalPage: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

@MainActor
final class TravelMapBrowser: ObservableObject {
    @Published var isLoading = true
    @Published var hasLoadError = false
    @Published var externalPage: ExternalPage?
    @Published var shareItem: ExternalPage?
    weak var webView: WKWebView?

    func reload() {
        hasLoadError = false
        isLoading = true
        webView?.load(URLRequest(url: TravelMapSite.home))
    }

    func openExternal(_ url: URL) {
        if url.scheme == "iosamap" || url.scheme == "amapuri" {
            UIApplication.shared.open(url)
        } else if url.scheme == "https" || url.scheme == "http" {
            externalPage = ExternalPage(url: url)
        }
    }
}

struct TravelMapScreen: View {
    @StateObject private var browser = TravelMapBrowser()

    var body: some View {
        ZStack {
            Color(red: 1, green: 0.97, blue: 0.87).ignoresSafeArea()

            TravelMapWebView(browser: browser)

            if browser.isLoading && !browser.hasLoadError {
                ProgressView("正在打开旅伴地图…")
                    .padding(24)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
            }

            if browser.hasLoadError {
                VStack(spacing: 16) {
                    Text("🧳").font(.system(size: 56))
                    Text("暂时没有连上旅行地图").font(.headline)
                    Text("检查网络连接后重试，你们的行程仍保存在账号里。")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    Button("重新连接") { browser.reload() }
                        .buttonStyle(.borderedProminent)
                }
                .padding(30)
                .frame(maxWidth: 330)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24))
            }
        }
        .sheet(item: $browser.externalPage) { page in
            SafariPage(url: page.url)
                .ignoresSafeArea()
        }
        .sheet(item: $browser.shareItem) { item in
            SharePage(url: item.url)
        }
    }
}

private struct TravelMapWebView: UIViewRepresentable {
    @ObservedObject var browser: TravelMapBrowser

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.add(context.coordinator, name: "travelMap")

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 1, green: 0.97, blue: 0.87, alpha: 1)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.allowsBackForwardNavigationGestures = true
        browser.webView = view
        view.load(URLRequest(url: TravelMapSite.home))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(browser: browser) }

    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
        private let browser: TravelMapBrowser
        private var downloadFiles: [ObjectIdentifier: URL] = [:]

        init(browser: TravelMapBrowser) { self.browser = browser }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "travelMap",
                  let data = message.body as? [String: String],
                  data["type"] == "share-trip",
                  let raw = data["url"], let url = URL(string: raw),
                  url.scheme == "https", url.host == TravelMapSite.host,
                  url.query?.contains("trip=") == true else { return }
            browser.shareItem = ExternalPage(url: url)
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else {
                decisionHandler(.cancel)
                return
            }
            if action.shouldPerformDownload || url.scheme == "blob" {
                decisionHandler(.download)
                return
            }
            if url.scheme == "https", url.host == TravelMapSite.host {
                decisionHandler(.allow)
            } else if url.scheme == "about" {
                decisionHandler(.allow)
            } else {
                browser.openExternal(url)
                decisionHandler(.cancel)
            }
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if url.host == TravelMapSite.host { webView.load(action.request) }
                else { browser.openExternal(url) }
            }
            return nil
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction,
                     didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse,
                     didBecome download: WKDownload) {
            download.delegate = self
        }

        func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                      suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
            let safeName = URL(fileURLWithPath: suggestedFilename).lastPathComponent
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString + "-" + safeName)
            downloadFiles[ObjectIdentifier(download)] = destination
            completionHandler(destination)
        }

        func downloadDidFinish(_ download: WKDownload) {
            if let url = downloadFiles.removeValue(forKey: ObjectIdentifier(download)) {
                browser.shareItem = ExternalPage(url: url)
            }
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            downloadFiles.removeValue(forKey: ObjectIdentifier(download))
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            browser.isLoading = false
            browser.hasLoadError = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled {
                browser.isLoading = false
                browser.hasLoadError = true
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                     withError error: Error) {
            browser.isLoading = false
            browser.hasLoadError = true
        }
    }
}

private struct SafariPage: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}

private struct SharePage: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
