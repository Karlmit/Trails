package com.trails.app.ui.budget

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/** Mirrors app/(web)/trips/[tripId]/budget/page.tsx (filters not built -- full list only). */
@Composable
fun BudgetScreen(
    padding: PaddingValues,
    onOpenEntry: (String, String) -> Unit = { _, _ -> },
    viewModel: BudgetViewModel = hiltViewModel(),
) {
    val groups by viewModel.groups.collectAsState()

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        if (groups.isEmpty()) {
            Text(
                "No expenses recorded on this Trip yet.",
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                color = TrailsColors.TextSoft,
            )
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp)) {
                items(groups) { group ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                        shape = TrailsShapes.Card,
                        colors = CardDefaults.cardColors(containerColor = TrailsColors.Surface),
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(group.currency, style = MaterialTheme.typography.titleMedium, color = TrailsColors.Text)
                                Column(horizontalAlignment = Alignment.End) {
                                    Text(
                                        "Total: %.2f %s".format(group.total, group.currency),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = TrailsColors.TextSoft,
                                    )
                                    if (group.unpaidTotal > 0.0) {
                                        Text(
                                            "Unpaid: %.2f %s".format(group.unpaidTotal, group.currency),
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = TrailsColors.Text,
                                            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                                        )
                                    }
                                }
                            }
                            group.lineItems.forEach { item ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 10.dp)
                                        .clickable { onOpenEntry(item.entry.entryType, item.entry.id) },
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column {
                                        Text(item.entry.title, style = MaterialTheme.typography.bodyLarge, color = TrailsColors.BrandAccent)
                                        Text(item.label, style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
                                    }
                                    Text(
                                        "%.2f %s".format(item.entry.expenseAmount, item.entry.expenseCurrency),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = TrailsColors.Text,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
