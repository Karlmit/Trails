package com.trails.app.auth

import com.trails.app.network.TrailsApiService
import io.mockk.coEvery
import io.mockk.coVerify
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
    fun `confirmed unauthorized stored session is cleared`() = runTest {
        coEvery { tokens.currentToken() } returns "expired"
        coEvery { api.listTrips() } throws HttpException(Response.error<Any>(401, "unauthorized".toResponseBody()))

        assertFalse(repository.hasValidStoredSession())

        coVerify(exactly = 1) { tokens.clear() }
    }

    @Test
    fun `offline validation preserves stored session for cached startup`() = runTest {
        coEvery { tokens.currentToken() } returns "valid-offline"
        coEvery { api.listTrips() } throws IOException("offline")

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
