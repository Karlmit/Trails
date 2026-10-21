package com.trails.app.network

import com.trails.app.auth.TokenStore
import okhttp3.Interceptor
import okhttp3.Response
import kotlinx.coroutines.runBlocking

// Reads TokenStore's in-memory cached token synchronously (never blocks the
// OkHttp dispatcher thread on a DataStore read) -- the cache is primed once
// at process start (TrailsApplication.onCreate) and kept current by every
// TokenStore.save()/clear() call.
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenStore.cachedTokenOrNull()
        val originalRequest = chain.request()
        val isLoginRequest = originalRequest.url.encodedPath.trimEnd('/') == "/api/v1/auth" && originalRequest.method == "POST"
        val request = if (token != null && !isLoginRequest) {
            originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } else {
            originalRequest
        }
        val response = chain.proceed(request)
        if (response.code == 401 && token != null && !isLoginRequest) {
            // A server-confirmed rejection is the only network outcome that
            // invalidates a session. Room content is intentionally untouched.
            runBlocking { tokenStore.clearIfCurrent(token) }
        }
        return response
    }
}
