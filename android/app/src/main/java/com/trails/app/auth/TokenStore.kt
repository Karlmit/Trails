package com.trails.app.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.authDataStore by preferencesDataStore(name = "trails_auth")
enum class SessionState { Unknown, Authenticated, Unauthenticated }

// AD-6: the server issues one opaque Bearer token, valid 30 days, no refresh
// endpoint -- this just persists it (DataStore) and caches it in memory so
// AuthInterceptor never has to block on disk I/O per request.
@Singleton
class TokenStore @Inject constructor(@ApplicationContext context: Context) {
    private val dataStore = context.authDataStore
    private val tokenKey = stringPreferencesKey("session_token")
    private val usernameKey = stringPreferencesKey("username")

    @Volatile private var cachedToken: String? = null
    private val mutationMutex = Mutex()
    private val _sessionState = MutableStateFlow(SessionState.Unknown)
    val sessionState: StateFlow<SessionState> = _sessionState

    val username: Flow<String?> = dataStore.data.map { it[usernameKey] }

    fun cachedTokenOrNull(): String? = cachedToken

    /** Reads the persisted token, refreshing the in-memory cache, and returns it. */
    suspend fun currentToken(): String? {
        val stored = dataStore.data.first()[tokenKey]
        cachedToken = stored
        _sessionState.value = if (stored != null) SessionState.Authenticated else SessionState.Unauthenticated
        return stored
    }

    suspend fun save(token: String, username: String) = mutationMutex.withLock {
        dataStore.edit { prefs ->
            prefs[tokenKey] = token
            prefs[usernameKey] = username
        }
        cachedToken = token
        _sessionState.value = SessionState.Authenticated
    }

    suspend fun clear() = mutationMutex.withLock {
        dataStore.edit { it.clear() }
        cachedToken = null
        _sessionState.value = SessionState.Unauthenticated
    }

    suspend fun clearIfCurrent(rejectedToken: String): Boolean = mutationMutex.withLock {
        if (cachedToken != rejectedToken) return@withLock false
        dataStore.edit { it.clear() }
        cachedToken = null
        _sessionState.value = SessionState.Unauthenticated
        true
    }
}
