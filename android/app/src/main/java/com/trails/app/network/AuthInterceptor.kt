package com.trails.app.network

import com.trails.app.auth.TokenStore
import okhttp3.Interceptor
import okhttp3.Response

// Reads TokenStore's in-memory cached token synchronously (never blocks the
// OkHttp dispatcher thread on a DataStore read) -- the cache is primed once
// at process start (TrailsApplication.onCreate) and kept current by every
// TokenStore.save()/clear() call.
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenStore.cachedTokenOrNull()
        val request = if (token != null) {
            chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } else {
            chain.request()
        }
        return chain.proceed(request)
    }
}
