package com.trails.app.ui.checklists

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.R
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.TrailsCard
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/** User-requested: tapping a Checklist shows only its title and Items -- editing metadata is a separate screen (its own Edit button, see the nav host). */
@Composable
fun ChecklistDetailScreen(padding: PaddingValues, viewModel: ChecklistDetailViewModel = hiltViewModel()) {
    val checklistWithItems by viewModel.checklist.collectAsState()
    val newItemText by viewModel.newItemText.collectAsState()
    val error by viewModel.error.collectAsState()
    val errorRes by viewModel.errorRes.collectAsState()
    val errorText = error ?: errorRes?.let { stringResource(it) }

    val scrollState = rememberScrollState()
    LaunchedEffect(errorText) { if (errorText != null) scrollState.animateScrollTo(0) }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        errorText?.let { ErrorBanner(it) }

        val cwi = checklistWithItems
        if (cwi == null) {
            Text(stringResource(R.string.checklist_loading), color = TrailsColors.TextSoft)
        } else {
            TrailsCard {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(cwi.checklist.emoji?.takeIf { it.isNotBlank() } ?: "✅", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        cwi.checklist.title,
                        style = MaterialTheme.typography.titleLarge,
                        color = TrailsColors.Brand,
                        modifier = Modifier.padding(start = 10.dp),
                    )
                }

                if (cwi.items.isEmpty()) {
                    Text(
                        stringResource(R.string.checklist_detail_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TrailsColors.TextSoft,
                    )
                } else {
                    Column {
                        cwi.items.forEach { item ->
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(
                                    checked = item.checked,
                                    onCheckedChange = { checked -> viewModel.setChecked(item.id, checked) },
                                    colors = CheckboxDefaults.colors(checkedColor = TrailsColors.BrandAccent),
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        item.text,
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = if (item.checked) TrailsColors.TextSoft else TrailsColors.Text,
                                        textDecoration = if (item.checked) TextDecoration.LineThrough else null,
                                    )
                                    item.note?.let {
                                        Text(it, style = MaterialTheme.typography.bodySmall, color = TrailsColors.TextSoft)
                                    }
                                }
                                IconButton(onClick = { viewModel.deleteItem(item.id) }) {
                                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.checklist_remove_item_description), tint = TrailsColors.TextSoft)
                                }
                            }
                        }
                    }
                }

                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = newItemText,
                        onValueChange = viewModel::onNewItemTextChange,
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        placeholder = { Text(stringResource(R.string.checklist_add_item_placeholder)) },
                        shape = TrailsShapes.Input,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = TrailsColors.BrandAccent,
                            unfocusedBorderColor = TrailsColors.InputBorder,
                            focusedContainerColor = TrailsColors.Surface,
                            unfocusedContainerColor = TrailsColors.Surface,
                        ),
                    )
                    IconButton(
                        onClick = viewModel::addItem,
                        modifier = Modifier.padding(start = 8.dp).size(44.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(containerColor = TrailsColors.BrandAccent, contentColor = TrailsColors.TextOnDark),
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.checklist_add_item_description))
                    }
                }
            }
        }
    }
}
