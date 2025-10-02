package com.example.washsimple.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "machines")
public class Machine {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    private boolean inUse;
    private Instant endTime;
    private Long currentUserId;

    // getters and setters
    public Long getId(){return id;}
    public void setId(Long id){this.id=id;}
    public String getName(){return name;}
    public void setName(String name){this.name=name;}
    public boolean isInUse(){return inUse;}
    public void setInUse(boolean inUse){this.inUse=inUse;}
    public Instant getEndTime(){return endTime;}
    public void setEndTime(Instant endTime){this.endTime=endTime;}
    public Long getCurrentUserId(){return currentUserId;}
    public void setCurrentUserId(Long currentUserId){this.currentUserId=currentUserId;}
}
