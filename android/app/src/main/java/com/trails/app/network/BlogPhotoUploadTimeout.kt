package com.trails.app.network

import okhttp3.Interceptor
import okhttp3.Response
import java.util.concurrent.TimeUnit

object BlogPhotoUploadTimeout : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val uploadChain = if (request.tag(BlogPhotoUploadTimeout::class.java) != null) {
            // These limits measure inactivity per operation, so a slow but
            // steadily progressing transfer can take longer than two minutes.
            chain.withWriteTimeout(120, TimeUnit.SECONDS).withReadTimeout(120, TimeUnit.SECONDS)
        } else chain
        return uploadChain.proceed(request)
    }
}
