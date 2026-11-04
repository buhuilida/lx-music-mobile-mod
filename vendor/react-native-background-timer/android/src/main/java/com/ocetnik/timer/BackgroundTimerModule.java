package com.ocetnik.timer;

import android.os.Handler;
import android.os.PowerManager;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.lang.Runnable;

public class BackgroundTimerModule extends ReactContextBaseJavaModule {

    private Handler handler;
    private final ReactContext reactContext;
    private Runnable runnable;

    private int listenerCount = 0;

    public BackgroundTimerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "RNBackgroundTimer";
    }

    @ReactMethod
    public void addListener(String eventName) {
        if (listenerCount == 0) {
        // Set up any upstream listeners or background tasks as necessary
        }

        listenerCount += 1;
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        listenerCount -= count;
        if (listenerCount == 0) {
        // Remove upstream listeners, stop unnecessary background tasks
        }
    }

    @ReactMethod
    public void start(final int delay) {
        handler = new Handler();
        runnable = () -> sendEvent(reactContext, "backgroundTimer");

        handler.post(runnable);
    }

    @ReactMethod
    public void stop() {
        // avoid null pointer exceptio when stop is called without start
        if (handler != null) handler.removeCallbacks(runnable);
    }

    private void sendEvent(ReactContext reactContext, String eventName) {
        reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit(eventName, null);
    }

    @ReactMethod
    public void setTimeout(final int id, final double timeout) {
        Handler handler = new Handler();
        handler.postDelayed(() -> {
            if (reactContext.hasActiveReactInstance()) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("backgroundTimer.timeout", id);
            }
       }, (long) timeout);
    }

    /*@ReactMethod
    public void clearTimeout(final int id) {
        // todo one day..
        // not really neccessary to have
    }*/
}
