"""Exercise the signed Android APK, including native layout and offline persistence."""
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PACKAGE = "dev.thoughts.miniapp"
OUTPUT = Path("android-smoke-results")
OUTPUT.mkdir(exist_ok=True)


def adb(*args, binary=False):
    return subprocess.check_output(["adb", *args], text=not binary, timeout=45)


def hierarchy():
    adb("shell", "uiautomator", "dump", "/sdcard/thoughts-ui.xml")
    return ET.fromstring(adb("shell", "cat", "/sdcard/thoughts-ui.xml"))


def bounds(node):
    return list(map(int, re.findall(r"\d+", node.attrib["bounds"])))


def find(label, contains=False, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        tree = hierarchy()
        # The freshly booted Google image can show a Pixel Launcher ANR while
        # initializing its home screen. Dismiss only this named system-app dialog;
        # a Thoughts ANR or crash must still fail the test.
        if any(n.get('text') == "Pixel Launcher isn't responding" for n in tree.iter('node')):
            close = next(n for n in tree.iter('node') if n.get('text') == 'Close app')
            x1, y1, x2, y2 = bounds(close)
            adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
            continue
        # Explicit accessibility labels identify tabs/actions even when a heading
        # on the same screen has identical text.
        nodes = list(tree.iter("node"))
        nodes.sort(key=lambda n: not bool(n.get("content-desc")))
        for node in nodes:
            values = [node.get("text", ""), node.get("content-desc", "")]
            matches = any(label in v if contains else label == v for v in values)
            if matches:
                x1, y1, x2, y2 = bounds(node)
                if x2 > x1 and y2 > y1:
                    return node
        time.sleep(0.5)
    (OUTPUT / "failed-ui.xml").write_text(ET.tostring(tree, encoding="unicode"))
    raise AssertionError(f"Visible Android element missing: {label}")


def tap(label, contains=False):
    node = find(label, contains)
    x1, y1, x2, y2 = bounds(node)
    adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))


def capture(name):
    (OUTPUT / f"{name}.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
    (OUTPUT / f"{name}.xml").write_text(ET.tostring(hierarchy(), encoding="unicode"))


def launch():
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")


def check_bottom_navigation():
    # This catches the reported regression: tabs/composer near the top and zero-height scroll views.
    height = int(re.findall(r"\d+", adb("shell", "wm", "size"))[-1])
    for label in ["Мысли", "Проекты", "AI", "Настройки"]:
        node = find(label)
        assert bounds(node)[1] > height * 0.7, f"{label} navigation collapsed: {node.attrib}"


try:
    adb("install", "-r", sys.argv[1])
    # A fresh emulator contains only disposable test data. Keep it offline, including launch,
    # so this verifies the embedded APK rather than replacing it with an OTA bundle.
    adb("shell", "svc", "wifi", "disable")
    adb("shell", "svc", "data", "disable")
    launch()
    find("Пока нет мыслей")
    check_bottom_navigation()
    capture("01-empty-thoughts")

    tap("Проекты")
    find("Быстрый старт")
    check_bottom_navigation()
    tap("Работа", contains=True)
    find("Проект Работа")
    capture("02-projects")
    tap("Проект Работа")
    tap("Все")
    tap("Новая мысль")
    adb("shell", "input", "text", "Thoughts%soffline%stest")
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    tap("Сохранить мысль")
    find("Thoughts offline test", contains=True)
    check_bottom_navigation()
    capture("03-saved-offline")
    launch()
    find("Thoughts offline test", contains=True)
    capture("04-restored-after-relaunch")
    tap("Открыть мысль:", contains=True)
    find("Исходный текст")
    capture("05-note-editor")
    tap("Закрыть")

    tap("AI")
    find("Ждут AI")
    check_bottom_navigation()
    capture("06-ai-queue")
    tap("Настройки")
    find("Диктовка и приватность", contains=True)
    check_bottom_navigation()
    capture("07-settings")
    tap("Голос", contains=True)
    find("Язык диктовки")
    capture("08-voice-settings")
    tap("Назад")
    tap("Оформление", contains=True)
    tap("Тёмная")
    capture("09-dark-theme")
    tap("Светлая")
    capture("10-light-theme")
    tap("Назад")
    tap("Notion", contains=True)
    find("Notion", contains=True)
    capture("11-notion")
    tap("Назад")
    tap("Обновления", contains=True)
    find("Проверить обновления")
    capture("12-updates")
    print("PASS: native layout, all tabs, project creation, note edit, offline save/relaunch, settings and themes")
except Exception:
    capture("failure")
    raise
finally:
    (OUTPUT / "logcat.txt").write_text(adb("logcat", "-d", "-t", "3000"))
