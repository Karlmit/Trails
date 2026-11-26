package com.trails.app.auth

import com.trails.app.network.TrailsApiService
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException
import kotlinx.coroutines.CancellationException
import org.junit.Assert.fail

class AuthRepositoryTest {
    private val api = mockk<TrailsApiService>()
    private val tokens = mockk<TokenStore>(relaxed = true)
    private val repository = AuthRepository(api, tokens)

    @Test
    fun `a confirmed rejection cleared by the interceptor returns signed out`() = runTest {
        coEvery { tokens.currentToken() } returns "expired"
        every { tokens.cachedTokenOrNull() } returns null
        coEvery { api.listTrips() } throws HttpException(Response.error<Any>(401, "unauthorized".toResponseBody()))

        assertFalse(repository.hasValidStoredSession())

        coVerify(exactly = 0) { tokens.clear() }
    }

    @Test
    fun `offline validation preserves stored session for cached startup`() = runTest {
        coEvery { tokens.currentToken() } returns "valid-offline"
        every { tokens.cachedTokenOrNull() } returns "valid-offline"
        coEvery { api.listTrips() } throws IOException("offline")

        assertTrue(repository.hasValidStoredSession())

        coVerify(exactly = 0) { tokens.clear() }
    }

    @Test
    fun `proxy unauthorized response preserves the stored session`() = runTest {
        coEvery { tokens.currentToken() } returns "stored"
        every { tokens.cachedTokenOrNull() } returns "stored"
        coEvery { api.listTrips() } throws HttpException(Response.error<Any>(401, "proxy login".toResponseBody()))

        assertTrue(repository.hasValidStoredSession())
        coVerify(exactly = 0) { tokens.clear() }
    }

    @Test
    fun `validation rethrows cancellation and unexpected failures`() = runTest {
        coEvery { tokens.currentToken() } returns "token"
        coEvery { api.listTrips() } throws CancellationException("cancelled")
        try { repository.hasValidStoredSession(); fail("cancellation must propagate") } catch (_: CancellationException) {}

        coEvery { api.listTrips() } throws IllegalStateException("bad payload")
        try { repository.hasValidStoredSession(); fail("unexpected failures must propagate") } catch (_: IllegalStateException) {}
    }
}
