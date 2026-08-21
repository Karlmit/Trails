package com.trails.app.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.authDataStore by preferencesDataStore(name = "trails_auth")

// AD-6: the server issues one opaque Bearer token, valid 30 days, no refresh
// endpoint -- this just persists it (DataStore) and caches it in memory so
// AuthInterceptor never has to block on disk I/O per request.
@Singleton
class TokenStore @Inject constructor(@ApplicationContext context: Context) {
    private val dataStore = context.authDataStore
    private val tokenKey = stringPreferencesKey("session_token")
    private val usernameKey = stringPreferencesKey("username")

    @Volatile private var cachedToken: String? = null

    val username: Flow<String?> = dataStore.data.map { it[usernameKey] }

    fun cachedTokenOrNull(): String? = cachedToken

    /** Reads the persisted token, refreshing the in-memory cache, and returns it. */
    suspend fun currentToken(): String? {
        val stored = dataStore.data.first()[tokenKey]
        cachedToken = stored
        return stored
    }

    suspend fun save(token: String, username: String) {
        dataStore.edit { prefs ->
            prefs[tokenKey] = token
            prefs[usernameKey] = username
        }
        cachedToken = token
    }

    suspend fun clear() {
        dataStore.edit { it.clear() }
        cachedToken = null
    }
}
