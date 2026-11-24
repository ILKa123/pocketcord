# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Pocketcord: мосты для JS (PcClip, PcNotify) — R8 не должен удалять/переименовывать их методы
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.pocketcord.app.ClipBridge { *; }
-keep class com.pocketcord.app.NotifyBridge { *; }
-keep class com.pocketcord.app.ImageInput { *; }
-keep class com.pocketcord.app.KeepAliveService { *; }
-keep class com.pocketcord.app.MainActivity { *; }
-keep class com.pocketcord.app.NotifyActionReceiver { *; }
-keep class com.pocketcord.app.BubbleHub { *; }

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile