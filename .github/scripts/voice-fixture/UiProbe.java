package dev.thoughts.uiprobe;

import android.app.Instrumentation;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Xml;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.StringWriter;
import org.xmlpull.v1.XmlSerializer;

/** Reads native accessibility without waiting for a ticking clock to become idle. */
public class UiProbe extends Instrumentation {
    private void write(XmlSerializer xml, AccessibilityNodeInfo node) throws Exception {
        xml.startTag(null, "node");
        Rect rect = new Rect(); node.getBoundsInScreen(rect);
        xml.attribute(null, "text", node.getText() == null ? "" : node.getText().toString());
        xml.attribute(null, "content-desc", node.getContentDescription() == null ? "" : node.getContentDescription().toString());
        xml.attribute(null, "bounds", "[" + rect.left + "," + rect.top + "][" + rect.right + "," + rect.bottom + "]");
        xml.attribute(null, "enabled", String.valueOf(node.isEnabled()));
        xml.attribute(null, "package", String.valueOf(node.getPackageName()));
        xml.attribute(null, "class", String.valueOf(node.getClassName()));
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null && child.isVisibleToUser()) write(xml, child);
        }
        xml.endTag(null, "node");
    }
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
            for (int i = 0; root == null && i < 20; i++) { SystemClock.sleep(50); root = getUiAutomation().getRootInActiveWindow(); }
            if (root == null) throw new Exception("No active accessibility window");
            StringWriter out = new StringWriter(); XmlSerializer xml = Xml.newSerializer(); xml.setOutput(out);
            xml.startTag(null, "hierarchy"); write(xml, root); xml.endTag(null, "hierarchy"); xml.flush();
            result.putString("xml", Base64.encodeToString(out.toString().getBytes("UTF-8"), Base64.NO_WRAP));
            finish(-1, result);
        } catch (Exception error) { result.putString("error", error.toString()); finish(0, result); }
    }
}
