package com.trails.app.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trails.app.ui.components.ErrorBanner
import com.trails.app.ui.components.LabeledField
import com.trails.app.ui.components.PillButton
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/** Mirrors app/(web)/login/page.tsx + components/AuthForm.tsx. */
@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(state.alreadyLoggedIn) {
        if (state.alreadyLoggedIn) onLoggedIn()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(modifier = Modifier.widthIn(max = 380.dp).fillMaxWidth()) {
            Text("Log in", style = MaterialTheme.typography.titleLarge, color = TrailsColors.Brand)
            Text(
                "Welcome back to Trails.",
                style = MaterialTheme.typography.bodyLarge,
                color = TrailsColors.TextSoft,
                modifier = Modifier.padding(top = 4.dp, bottom = 20.dp),
            )

            ElevatedCard(
                shape = TrailsShapes.Card,
                colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
                elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp),
            ) {
                Column(modifier = Modifier.padding(24.dp)) {
                    val error = state.error
                    if (error != null) {
                        ErrorBanner(error, modifier = Modifier.padding(bottom = 16.dp))
                    }

                    LabeledField(
                        label = "Username",
                        value = state.username,
                        onValueChange = viewModel::onUsernameChange,
                    )
                    LabeledField(
                        label = "Password",
                        value = state.password,
                        onValueChange = viewModel::onPasswordChange,
                        keyboardType = KeyboardType.Password,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.padding(top = 16.dp),
                    )

                    PillButton(
                        text = if (state.isLoading) "Please wait…" else "Log in",
                        onClick = { viewModel.login(onLoggedIn) },
                        enabled = !state.isLoading,
                        modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
                    )
                }
            }
        }
    }
}
