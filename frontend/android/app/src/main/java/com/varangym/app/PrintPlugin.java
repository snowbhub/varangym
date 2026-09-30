package com.varangym.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {
    private WebView printView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.isEmpty()) {
            call.reject("html is required");
            return;
        }
        final String jobName = call.getString("name", "VARANGYM");
        getActivity().runOnUiThread(() -> {
            WebView webView = new WebView(getContext());
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                    if (printManager == null) {
                        printView = null;
                        call.reject("printing is not available on this device");
                        return;
                    }
                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                    printManager.print(jobName, adapter, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                    call.resolve();
                }
            });
            webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            printView = webView;
        });
    }
}
