package com.trails.app.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "checklists", indices = [Index("tripId")])
data class ChecklistEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val title: String,
    // User-requested: "user can choose an emoji" (typed via the device's
    // own emoji keyboard) instead of every Checklist showing the same
    // fixed checkmark. Null falls back to a generic glyph client-side.
    val emoji: String? = null,
    val isPrivate: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
)

@Entity(tableName = "checklist_items", indices = [Index("checklistId")])
data class ChecklistItemEntity(
    @PrimaryKey val id: String,
    val checklistId: String,
    val text: String,
    val checked: Boolean,
    val note: String?,
    val createdAt: String,
    val updatedAt: String,
    // User-requested: marking an item checked/unchecked must work offline
    // and sync once back online, not fail outright. True from the moment
    // a local toggle hasn't yet been confirmed by the server; cleared once
    // the PATCH succeeds (immediately if online, or via
    // ChecklistItemSyncWorker/the next trip sync once connectivity
    // returns). `checked` itself is always the current local truth --
    // there's no separate "pending value," since it's updated in place.
    val syncPending: Boolean = false,
)
