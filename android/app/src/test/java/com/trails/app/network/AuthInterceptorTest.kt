package com.trails.app.network

import com.trails.app.auth.TokenStore
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Test

class AuthInterceptorTest {
    private val tokens = mockk<TokenStore>(relaxed = true)

    @Test
    fun `authenticated endpoint 401 clears session`() {
        every { tokens.cachedTokenOrNull() } returns "expired"
        val chain = chainFor("https://example.test/api/v1/ideas", "GET", 401)

        AuthInterceptor(tokens).intercept(chain)

        coVerify(exactly = 1) { tokens.clearIfCurrent("expired") }
    }

    @Test
    fun `login 401 and server failure do not clear session`() {
        every { tokens.cachedTokenOrNull() } returns "old"
        val loginChain = chainFor("https://example.test/api/v1/auth", "POST", 401)

        AuthInterceptor(tokens).intercept(loginChain)
        AuthInterceptor(tokens).intercept(chainFor("https://example.test/api/v1/ideas", "GET", 503))

        coVerify(exactly = 0) { tokens.clearIfCurrent(any()) }
        io.mockk.verify { loginChain.proceed(match { it.header("Authorization") == null }) }
    }

    @Test
    fun `late unauthorized response targets only its rejected token`() {
        every { tokens.cachedTokenOrNull() } returns "old"
        AuthInterceptor(tokens).intercept(chainFor("https://example.test/api/v1/ideas", "GET", 401))
        coVerify(exactly = 1) { tokens.clearIfCurrent("old") }
        coVerify(exactly = 0) { tokens.clearIfCurrent("new") }
    }

    private fun chainFor(url: String, method: String, code: Int): Interceptor.Chain {
        val body = if (method == "GET") null else ByteArray(0).toRequestBody()
        val original = Request.Builder().url(url).method(method, body).build()
        return mockk {
            every { request() } returns original
            every { proceed(any()) } answers {
                Response.Builder()
                    .request(firstArg())
                    .protocol(Protocol.HTTP_1_1)
                    .message("test")
                    .code(code)
                    .build()
            }
        }
    }
}
