package com.trails.app.ui.blog

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import com.trails.app.R
import com.trails.app.ui.theme.TrailsTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ProofreadingSheetTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `shows the exact correction and keeps the original separate`() {
        val source = "Vi åker med tuktukt för vila."
        val correction = "Vi åker med tuktuk för att vila."
        val suggestion = proofreadingSuggestion(listOf(InlineRun(source)), correction)
        val context = ApplicationProvider.getApplicationContext<Context>()

        compose.setContent {
            TrailsTheme {
                BlogProofreadingSheet(
                    state = suggestion,
                    canApply = true,
                    onDismiss = {},
                    onRetry = {},
                    onDownload = {},
                    onInsert = {},
                    onReplace = {},
                )
            }
        }

        compose.onNodeWithText(correction).assertIsDisplayed()
        compose.onNodeWithText(source).assertDoesNotExist()
        compose.onNodeWithText(context.getString(R.string.blog_proofread_show_original)).performClick()
        compose.onNodeWithText(source).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText(correction).assertExists()
    }
}
