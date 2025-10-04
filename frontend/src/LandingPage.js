import React from 'react';
import './LandingPage.css';

export default function LandingPage({ onGetStarted }) {
  return (
    <div className="landing-page">
      <div className="landing-content">
        <div className="landing-icon">💧</div>
        <h1 className="landing-title">WashSimple</h1>
        <p className="landing-subtitle">Smart Laundry Management System</p>
        <p className="landing-description">
          Manage washing machine queues, track availability, and get notified when it's your turn.
        </p>
        <button className="get-started-btn" onClick={onGetStarted}>
          Get Started
        </button>
      </div>
    </div>
  );
}