package com.freekiosk

import android.content.Context
import android.provider.Settings
import java.util.UUID

/** Provides the stable machine code shared by remote configuration and MQTT. */
object DeviceIdentity {
    private const val PREFERENCES_NAME = "freekiosk_device_identity"
    private const val FALLBACK_MACHINE_CODE_KEY = "fallback_machine_code"

    fun getMachineCode(context: Context): String {
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID,
        )?.trim()
        if (!androidId.isNullOrEmpty()) {
            return androidId
        }

        val preferences = context.applicationContext.getSharedPreferences(
            PREFERENCES_NAME,
            Context.MODE_PRIVATE,
        )
        synchronized(this) {
            preferences.getString(FALLBACK_MACHINE_CODE_KEY, null)
                ?.takeIf { it.isNotBlank() }
                ?.let { return it }

            val generated = UUID.randomUUID().toString()
            val persisted = preferences.edit()
                .putString(FALLBACK_MACHINE_CODE_KEY, generated)
                .commit()
            if (!persisted) {
                throw IllegalStateException("Failed to persist the fallback machine code.")
            }
            return generated
        }
    }
}
