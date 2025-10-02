package com.example.washsimple.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "queue_entries")
public class QueueEntry {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long machineId;
    private Long userId;
    private Instant createdAt;
    private Integer minutes; // new field

    public Long getId(){return id;}
    public void setId(Long id){this.id=id;}
    public Long getMachineId(){return machineId;}
    public void setMachineId(Long m){this.machineId=m;}
    public Long getUserId(){return userId;}
    public void setUserId(Long u){this.userId=u;}
    public Instant getCreatedAt(){return createdAt;}
    public void setCreatedAt(Instant t){this.createdAt=t;}
    public Integer getMinutes(){return minutes;}
    public void setMinutes(Integer minutes){this.minutes = minutes;}
}
