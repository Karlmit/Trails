package com.trails.app.ui.nav

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasProgressBarRangeInfo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import androidx.test.core.app.ApplicationProvider
import com.trails.app.R

@RunWith(RobolectricTestRunner::class)
class IdeaSaveActionTest {
    @get:Rule val composeRule = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun `detail destination uses stable localized short title`() {
        val longIdeaTitle = "A very long user-authored idea title that must stay in content"
        val appBarTitle = context.getString(ideaDetailAppBarTitleRes())

        assertEquals(context.getString(R.string.shell_idea), appBarTitle)
        assertNotEquals(longIdeaTitle, appBarTitle)
    }

    @Test
    fun `idle save action invokes active callback once`() {
        var saves = 0
        composeRule.setContent { MaterialTheme { IdeaSaveAction(ready = true, saving = false) { saves++ } } }

        composeRule.onNodeWithText(context.getString(R.string.shell_save)).assertIsDisplayed().performClick()

        assertEquals(1, saves)
    }

    @Test
    fun `saving action retains localized name with progress and is disabled`() {
        val save = context.getString(R.string.shell_save)
        composeRule.setContent { MaterialTheme { IdeaSaveAction(ready = true, saving = true) {} } }

        composeRule.onNodeWithText(save).assertIsDisplayed()
        composeRule.onNodeWithContentDescription(save).assertIsNotEnabled()
        composeRule.onNode(hasProgressBarRangeInfo(androidx.compose.ui.semantics.ProgressBarRangeInfo.Indeterminate)).assertIsDisplayed()
    }

    @Test
    fun `normal and conversion destinations share ready gated callback behavior`() {
        var ready by mutableStateOf(false)
        var saves = 0
        composeRule.setContent { MaterialTheme { IdeaSaveAction(ready = ready, saving = false) { saves++ } } }
        composeRule.onNode(hasClickAction()).assertIsNotEnabled()
        assertEquals(0, saves)

        composeRule.runOnIdle { ready = true }
        composeRule.onNodeWithText(context.getString(R.string.shell_save)).performClick()
        assertEquals(1, saves)
    }
}
