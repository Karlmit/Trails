package com.trails.app.auth

import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.LoginRequest
import retrofit2.HttpException
import java.io.IOException
import kotlinx.coroutines.CancellationException
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
        return try {
            api.listTrips()
            true
        } catch (failure: HttpException) {
            if (failure.code() == 401) tokenStore.clear()
            failure.code() != 401
        } catch (failure: CancellationException) {
            throw failure
        } catch (_: IOException) {
            true
        }
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
