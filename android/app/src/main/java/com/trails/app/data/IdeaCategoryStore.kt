package com.trails.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.ideaCategoriesDataStore by preferencesDataStore(name = "trails_idea_categories")

/**
 * Idea.category has always been a free-text server field (no enum) -- this
 * is purely a client-side convenience layer so the Android editor can offer
 * a dropdown instead of a plain text field. The known-category list per Trip
 * is local-only, never synced: it's just "categories this device has seen or
 * added for this Trip," decoupled from what any individual Idea's stored
 * `category` actually is, so removing one from the list here never touches
 * an Idea that already used it.
 */
@Singleton
class IdeaCategoryStore @Inject constructor(@ApplicationContext context: Context) {
    private val dataStore = context.ideaCategoriesDataStore

    private fun keyFor(tripId: String) = stringSetPreferencesKey("categories_$tripId")

    fun observe(tripId: String): Flow<Set<String>> = dataStore.data.map { it[keyFor(tripId)] ?: emptySet() }

    suspend fun add(tripId: String, category: String) {
        dataStore.edit { prefs ->
            val key = keyFor(tripId)
            prefs[key] = (prefs[key] ?: emptySet()) + category
        }
    }

    suspend fun remove(tripId: String, category: String) {
        dataStore.edit { prefs ->
            val key = keyFor(tripId)
            prefs[key] = (prefs[key] ?: emptySet()) - category
        }
    }
}
