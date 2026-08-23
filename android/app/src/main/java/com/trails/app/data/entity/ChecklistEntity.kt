package com.trails.app.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "checklists", indices = [Index("tripId")])
data class ChecklistEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val title: String,
    val description: String?,
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
)
