#!/usr/bin/env bash
# CI-only test helpers, installed on the disposable emulator, never in Thoughts.
set -euo pipefail
fixture_dir="$(cd "$(dirname "$0")/voice-fixture" && pwd)"
fixture_tmp="${RUNNER_TEMP:-/tmp}/thoughts-voice-fixture"
fixture_sdk="${ANDROID_HOME}/platforms/android-35/android.jar"
fixture_tools="${ANDROID_HOME}/build-tools/37.0.0"
mkdir -p "$fixture_tmp/classes" "$fixture_tmp/dex"
javac -encoding UTF-8 -source 8 -target 8 -cp "$fixture_sdk" -d "$fixture_tmp/classes" "$fixture_dir"/*.java
mapfile -t fixture_classes < <(find "$fixture_tmp/classes" -name '*.class')
"$fixture_tools/d8" --min-api 26 --lib "$fixture_sdk" --output "$fixture_tmp/dex" "${fixture_classes[@]}"
keytool -genkeypair -keystore "$fixture_tmp/test.keystore" -storepass fixture-test -keypass fixture-test -alias fixture -dname 'CN=Thoughts CI fixture' -keyalg RSA -validity 10 -noprompt
cat > "$fixture_tmp/speech.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.thoughts.speechfixture" android:versionCode="1">
  <uses-permission android:name="android.permission.RECORD_AUDIO"/>
  <application android:label="Thoughts CI speech fixture" android:debuggable="true">
    <service android:name=".FixtureService" android:exported="true" android:permission="android.permission.BIND_SPEECH_RECOGNITION_SERVICE">
      <intent-filter><action android:name="android.speech.RecognitionService"/><category android:name="android.intent.category.DEFAULT"/></intent-filter>
    </service>
  </application>
</manifest>
XML
cat > "$fixture_tmp/probe.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.thoughts.uiprobe" android:versionCode="1">
  <application android:label="Thoughts CI accessibility probe" android:debuggable="true"/>
  <instrumentation android:name=".UiProbe" android:targetPackage="dev.thoughts.uiprobe"/>
</manifest>
XML
for fixture_name in speech probe; do
  "$fixture_tools/aapt2" link --manifest "$fixture_tmp/$fixture_name.xml" -I "$fixture_sdk" --min-sdk-version 26 --target-sdk-version 35 -o "$fixture_tmp/$fixture_name-unsigned.apk"
  python3 - "$fixture_tmp/$fixture_name-unsigned.apk" "$fixture_tmp/dex/classes.dex" <<'PY'
import zipfile,sys
with zipfile.ZipFile(sys.argv[1], 'a') as apk: apk.write(sys.argv[2], 'classes.dex')
PY
  "$fixture_tools/apksigner" sign --ks "$fixture_tmp/test.keystore" --ks-pass pass:fixture-test --key-pass pass:fixture-test --out "$fixture_tmp/$fixture_name.apk" "$fixture_tmp/$fixture_name-unsigned.apk"
  adb install -r "$fixture_tmp/$fixture_name.apk"
done
adb shell pm grant dev.thoughts.speechfixture android.permission.RECORD_AUDIO
adb shell settings put secure voice_recognition_service dev.thoughts.speechfixture/.FixtureService
