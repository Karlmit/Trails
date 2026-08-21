package com.trails.app.ui.budget

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.ui.timeline.graph.ENTRY_TYPE_LABELS
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

data class BudgetLineItem(val entry: TimelineEntryEntity, val label: String)
data class BudgetGroup(val currency: String, val total: Double, val lineItems: List<BudgetLineItem>)

/** Mirrors lib/budget.ts::aggregateBudget -- grouped by currency, no cross-currency conversion. */
@HiltViewModel
class BudgetViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    timelineRepository: TimelineRepository,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])

    val groups: StateFlow<List<BudgetGroup>> = timelineRepository.observeEntries(tripId)
        .map { entries ->
            entries
                .filter { it.expenseAmount != null && it.expenseCurrency != null }
                .sortedBy { it.startAt }
                .groupBy { it.expenseCurrency!! }
                .map { (currency, group) ->
                    BudgetGroup(
                        currency = currency,
                        total = group.sumOf { it.expenseAmount ?: 0.0 },
                        lineItems = group.map { entry ->
                            BudgetLineItem(
                                entry,
                                buildString {
                                    append(ENTRY_TYPE_LABELS[entry.entryType] ?: entry.entryType)
                                    entry.expensePaymentStatus?.let { append(" · $it") }
                                    entry.expensePaymentNote?.let { append(" · $it") }
                                },
                            )
                        },
                    )
                }
                .sortedBy { it.currency }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}
