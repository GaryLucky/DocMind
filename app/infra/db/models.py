from __future__ import annotations

import datetime as dt
import os
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.infra.db.sqlalchemy import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.UTC)
    )

    chat_turns: Mapped[list["ChatTurn"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    owner: Mapped[str] = mapped_column(String(128), nullable=False, default="anonymous")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.UTC)
    )

    chunks: Mapped[list["Chunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    rewrite_reviews: Mapped[list["RewriteReview"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class RewriteReview(Base):
    __tablename__ = "rewrite_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False)
    start_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    end_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    style: Mapped[str] = mapped_column(String(64), nullable=False, default="professional")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")

    base_content: Mapped[str] = mapped_column(Text, nullable=False)
    base_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    proposed_text: Mapped[str] = mapped_column(Text, nullable=False)
    diff_text: Mapped[str] = mapped_column(Text, nullable=False)

    applied_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    applied_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    applied_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rolled_back_at: Mapped[Optional[dt.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.UTC)
    )

    document: Mapped[Document] = relationship(back_populates="rewrite_reviews")


class RewriteReviewSession(Base):
    __tablename__ = "rewrite_review_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False)
    selection_start: Mapped[int] = mapped_column(Integer, nullable=False)
    selection_end: Mapped[int] = mapped_column(Integer, nullable=False)
    style: Mapped[str] = mapped_column(String(64), nullable=False, default="professional")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")

    base_content: Mapped[str] = mapped_column(Text, nullable=False)
    base_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    target_content: Mapped[str] = mapped_column(Text, nullable=False)
    target_sha256: Mapped[str] = mapped_column(String(64), nullable=False)

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.UTC)
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: dt.datetime.now(dt.UTC),
        onupdate=lambda: dt.datetime.now(dt.UTC),
    )

    document: Mapped[Document] = relationship()
    commits: Mapped[list["RewriteReviewCommit"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class RewriteReviewCommit(Base):
    __tablename__ = "rewrite_review_commits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("rewrite_review_sessions.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="applied")

    before_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    after_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    before_content: Mapped[str] = mapped_column(Text, nullable=False)
    after_content: Mapped[str] = mapped_column(Text, nullable=False)
    opcode_ids_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.UTC)
    )

    session: Mapped[RewriteReviewSession] = relationship(back_populates="commits")


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(
        Vector(int(os.getenv("EMBED_DIM", "1024"))),
        nullable=False,
    )

    document: Mapped[Document] = relationship(back_populates="chunks")


class ChatTurn(Base):
    __tablename__ = "chat_turns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    user_text: Mapped[str] = mapped_column(Text, nullable=False)
    assistant_text: Mapped[str] = mapped_column(Text, nullable=False)
    messages_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.UTC)
    )

    user: Mapped[User] = relationship(back_populates="chat_turns")
