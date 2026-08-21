package com.trails.app.auth

import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.LoginRequest
import retrofit2.HttpException
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: TrailsApiService,
    private val tokenStore: TokenStore,
) {
    suspend fun hasStoredToken(): Boolean = tokenStore.currentToken() != null

    val username: kotlinx.coroutines.flow.Flow<String?> = tokenStore.username

    suspend fun login(username: String, password: String): Result<Unit> = try {
        val response = api.login(LoginRequest(username, password))
        tokenStore.save(response.token, response.user.username)
        Result.success(Unit)
    } catch (e: HttpException) {
        // POST /api/v1/auth deliberately returns a generic 401 for every
        // failure case (unknown username, wrong password, malformed body) --
        // no field-level detail to surface (see the Phase 0/1 plan's API
        // contract notes).
        val message = if (e.code() == 401) "Invalid username or password" else "Login failed (HTTP ${e.code()})"
        Result.failure(Exception(message))
    } catch (e: IOException) {
        Result.failure(Exception("Could not reach the server: ${e.message}"))
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
