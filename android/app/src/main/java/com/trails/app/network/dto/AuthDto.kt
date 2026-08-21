package com.trails.app.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class UserDto(val id: String, val username: String, val role: String)

@Serializable
data class LoginResponse(val user: UserDto, val token: String)
