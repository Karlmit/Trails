package com.trails.app.auth

import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.LoginRequest
import retrofit2.HttpException
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerializationException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: TrailsApiService,
    private val tokenStore: TokenStore,
) {
    val sessionState = tokenStore.sessionState

    /**
     * Confirms a persisted session with an authenticated endpoint. Network and
     * server failures deliberately keep the offline session usable; only a
     * confirmed 401 (also handled centrally by AuthInterceptor) signs out.
     */
    suspend fun hasValidStoredSession(): Boolean {
        if (tokenStore.currentToken() == null) return false
        try {
            withTimeoutOrNull(4_000) { api.listTrips() }
        } catch (_: HttpException) {
            // AuthInterceptor handles confirmed session rejections.
        } catch (failure: CancellationException) {
            throw failure
        } catch (_: IOException) {
            // A stored session can open the cached trips while offline.
        } catch (_: SerializationException) {
            // An unexpected response cannot invalidate a stored session.
        }
        return tokenStore.cachedTokenOrNull() != null
    }

    val username: kotlinx.coroutines.flow.Flow<String?> = tokenStore.username

    suspend fun login(username: String, password: String): Result<Unit> = try {
        val response = api.login(LoginRequest(username, password))
        tokenStore.save(response.token, response.user.username)
        Result.success(Unit)
    } catch (_: HttpException) {
        // POST /api/v1/auth deliberately returns a generic 401 for every
        // failure case (unknown username, wrong password, malformed body) --
        // no field-level detail to surface (see the Phase 0/1 plan's API
        // contract notes). No message here (rather than an English one) --
        // LoginViewModel falls back to its own translated errorRes when
        // the throwable carries none.
        Result.failure(Exception())
    } catch (_: IOException) {
        Result.failure(Exception())
    }

    /** Best-effort server-side revoke; the local token is always discarded regardless. */
    suspend fun logout() {
        try {
            api.logout()
        } catch (_: Exception) {
            // Fine offline or if the token was already invalid server-side.
        }
        tokenStore.clear()
    }
}
