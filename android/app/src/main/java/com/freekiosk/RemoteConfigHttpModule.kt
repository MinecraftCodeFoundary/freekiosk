package com.freekiosk

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/**
 * Small, redirect-safe downloader used only by remote configuration.
 *
 * HttpURLConnection redirects are disabled. Redirects are followed manually
 * only after the next URL is verified as same-origin, so a Bearer token can
 * never be forwarded to another host or from HTTPS to HTTP.
 */
class RemoteConfigHttpModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TIMEOUT_MS = 8_000
        private const val MAX_RESPONSE_BYTES = 1_048_576
        private const val MAX_REDIRECTS = 5
    }

    override fun getName(): String = "RemoteConfigHttpModule"

    @ReactMethod
    fun fetch(
        sourceUrl: String,
        token: String,
        etag: String?,
        allowInsecureHttp: Boolean,
        promise: Promise,
    ) {
        Thread {
            try {
                val response = executeRequest(sourceUrl, token, etag, allowInsecureHttp)
                val result = Arguments.createMap().apply {
                    putInt("status", response.status)
                    putString("body", response.body)
                    putString("etag", response.etag)
                    putString("url", response.url)
                }
                promise.resolve(result)
            } catch (error: Exception) {
                promise.reject(
                    "REMOTE_CONFIG_HTTP_ERROR",
                    error.message ?: "Remote configuration request failed.",
                    error,
                )
            }
        }.start()
    }

    private data class HttpResult(
        val status: Int,
        val body: String,
        val etag: String?,
        val url: String,
    )

    private fun executeRequest(
        sourceUrl: String,
        token: String,
        etag: String?,
        allowInsecureHttp: Boolean,
    ): HttpResult {
        val original = URL(sourceUrl)
        validateUrl(original, allowInsecureHttp)

        var current = original
        var redirectCount = 0

        while (true) {
            val connection = current.openConnection() as? HttpURLConnection
                ?: throw IllegalArgumentException("Only HTTP and HTTPS URLs are supported.")
            try {
                connection.instanceFollowRedirects = false
                connection.requestMethod = "GET"
                connection.connectTimeout = TIMEOUT_MS
                connection.readTimeout = TIMEOUT_MS
                connection.setRequestProperty("Accept", "application/json")
                if (token.isNotEmpty()) {
                    connection.setRequestProperty("Authorization", "Bearer $token")
                }
                if (!etag.isNullOrEmpty()) {
                    connection.setRequestProperty("If-None-Match", etag)
                }

                val status = connection.responseCode
                if (isRedirect(status)) {
                    if (redirectCount >= MAX_REDIRECTS) {
                        throw IllegalStateException("Remote configuration redirected too many times.")
                    }
                    val location = connection.getHeaderField("Location")
                        ?: throw IllegalStateException("Remote configuration redirect is missing Location.")
                    val destination = URL(current, location)
                    validateUrl(destination, allowInsecureHttp)
                    if (!sameOrigin(original, destination)) {
                        throw SecurityException(
                            "Cross-origin redirects are not allowed for remote configuration.",
                        )
                    }
                    current = destination
                    redirectCount += 1
                    continue
                }

                val responseEtag = connection.getHeaderField("ETag")
                if (status == HttpURLConnection.HTTP_NOT_MODIFIED) {
                    return HttpResult(status, "", responseEtag, current.toExternalForm())
                }

                if (status !in 200..299) {
                    return HttpResult(status, "", responseEtag, current.toExternalForm())
                }

                val declaredLength = connection.contentLengthLong
                if (declaredLength > MAX_RESPONSE_BYTES) {
                    throw IllegalStateException("Remote configuration exceeds the 1 MiB size limit.")
                }

                val output = ByteArrayOutputStream(
                    if (declaredLength in 1..MAX_RESPONSE_BYTES.toLong()) {
                        declaredLength.toInt()
                    } else {
                        8_192
                    },
                )
                connection.inputStream.use { input ->
                    val buffer = ByteArray(8_192)
                    var total = 0
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        if (total > MAX_RESPONSE_BYTES) {
                            throw IllegalStateException(
                                "Remote configuration exceeds the 1 MiB size limit.",
                            )
                        }
                        output.write(buffer, 0, count)
                    }
                }

                return HttpResult(
                    status,
                    output.toString(Charsets.UTF_8.name()),
                    responseEtag,
                    current.toExternalForm(),
                )
            } finally {
                connection.disconnect()
            }
        }
    }

    private fun validateUrl(url: URL, allowInsecureHttp: Boolean) {
        if (url.userInfo != null) {
            throw SecurityException("Credentials in the URL are not allowed.")
        }
        when (url.protocol.lowercase(Locale.US)) {
            "https" -> Unit
            "http" -> if (!allowInsecureHttp) {
                throw SecurityException("Insecure HTTP is disabled for remote configuration.")
            }
            else -> throw IllegalArgumentException("Only HTTP and HTTPS URLs are supported.")
        }
    }

    private fun sameOrigin(left: URL, right: URL): Boolean =
        left.protocol.equals(right.protocol, ignoreCase = true) &&
            left.host.equals(right.host, ignoreCase = true) &&
            effectivePort(left) == effectivePort(right)

    private fun effectivePort(url: URL): Int = if (url.port >= 0) url.port else url.defaultPort

    private fun isRedirect(status: Int): Boolean =
        status == HttpURLConnection.HTTP_MULT_CHOICE ||
            status == HttpURLConnection.HTTP_MOVED_PERM ||
            status == HttpURLConnection.HTTP_MOVED_TEMP ||
            status == HttpURLConnection.HTTP_SEE_OTHER ||
            status == 307 ||
            status == 308
}
