package dev.thoughts.speechfixture;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.speech.RecognitionService;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import java.util.Arrays;

/** CI-only Android recognition service. Never packaged in the Thoughts APK. */
public class FixtureService extends RecognitionService {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Callback active;
    private Bundle words(String text) {
        Bundle data = new Bundle();
        data.putStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION, new ArrayList<>(Arrays.asList(text)));
        data.putFloatArray(SpeechRecognizer.CONFIDENCE_SCORES, new float[]{0.95f});
        return data;
    }
    @Override protected void onStartListening(Intent intent, Callback callback) {
        handler.removeCallbacksAndMessages(null);
        active = callback;
        ParcelFileDescriptor source = intent.getParcelableExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, ParcelFileDescriptor.class);
        if (source != null) new Thread(() -> {
            try (ParcelFileDescriptor.AutoCloseInputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(source)) {
                byte[] buffer = new byte[4096];
                while (stream.read(buffer) != -1) { /* consume the emulator microphone; never save it */ }
            } catch (Exception ignored) {}
        }).start();
        try { callback.readyForSpeech(new Bundle()); } catch (Exception ignored) {}
        handler.postDelayed(() -> {
            if (active != callback) return;
            try { callback.beginningOfSpeech(); callback.partialResults(words("Тестовая мысль")); } catch (Exception ignored) {}
        }, 500);
        handler.post(new Runnable() {
            public void run() {
                if (active != callback) return;
                try { callback.rmsChanged(7f); } catch (Exception ignored) {}
                handler.postDelayed(this, 200);
            }
        });
    }
    @Override protected void onStopListening(Callback callback) {
        Callback current = active;
        handler.removeCallbacksAndMessages(null);
        if (current == null) return;
        // A delayed final result reproduces the former pause/timer race.
        handler.postDelayed(() -> {
            if (active != current) return;
            try { current.endOfSpeech(); current.results(words("Тестовая мысль.")); } catch (Exception ignored) {}
            active = null;
        }, 2500);
    }
    @Override protected void onCancel(Callback callback) {
        active = null;
        handler.removeCallbacksAndMessages(null);
    }
}
