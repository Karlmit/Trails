package com.trails.app.network

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import org.junit.Assert.assertSame
import org.junit.Test
import java.util.concurrent.TimeUnit

class BlogPublishTimeoutTest {
    @Test
    fun `extends timeouts for staged photo requests only`() {
        val normal = Request.Builder().url("https://example.test/api/v1/photos").build()
        val staged = normal.newBuilder().tag(BlogPublishTimeout::class.java, BlogPublishTimeout).build()
        val regularChain = mockk<Interceptor.Chain>()
        val stagedChain = mockk<Interceptor.Chain>()
        val slowWrite = mockk<Interceptor.Chain>()
        val slowReadWrite = mockk<Interceptor.Chain>()
        val response = mockk<Response>()
        every { regularChain.request() } returns normal
        every { regularChain.proceed(normal) } returns response
        every { stagedChain.request() } returns staged
        every { stagedChain.withWriteTimeout(120, TimeUnit.SECONDS) } returns slowWrite
        every { slowWrite.withReadTimeout(120, TimeUnit.SECONDS) } returns slowReadWrite
        every { slowReadWrite.proceed(staged) } returns response

        assertSame(response, BlogPublishTimeout.intercept(regularChain))
        assertSame(response, BlogPublishTimeout.intercept(stagedChain))
        verify(exactly = 0) { regularChain.withWriteTimeout(any(), any()) }
        verify(exactly = 1) { slowReadWrite.proceed(staged) }
    }
}
